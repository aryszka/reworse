(function () {
    "use strict";

    var Events   = require("events");
    var FakeCert = require("./fake-cert");
    var Fs       = require("fs");
    var Http     = require("http");
    var Https    = require("https");
    var Net      = require("net");
    var Path     = require("path");
    var Url      = require("url");
    var Util     = require("util");

    var defaultSocketDir        = ".tmp";
    var httpSocketName          = "http";
    var httpsSocketName         = "https";
    var tunnelConnectSocketName = "https-tunnel-connect";
    var tunnelDataSocketName    = "https-tunnel-data";

    var Interface = function () {
        Events.EventEmitter.call(this);
    };

    Util.inherits(Interface, Events.EventEmitter);

    var getSocketPaths = function (socketDir) {
        return {
            http:          Path.join(socketDir, httpSocketName),
            https:         Path.join(socketDir, httpsSocketName),
            tunnelConnect: Path.join(socketDir, tunnelConnectSocketName),
            tunnelData:    Path.join(socketDir, tunnelDataSocketName)
        };
    };

    var mkdirIfNotExists = function (dn) {
        try {
            Fs.mkdirSync(dn);
        } catch (err) {
            if (err.code !== "EEXIST") {
                throw err;
            }
        }
    };

    var ensureDir = function (dir) {
        dir = Path.resolve(dir);

        var dn = Path.dirname(dir);
        if (dn !== "/" && dn !== ".") {
            ensureDir(dn);
        }

        mkdirIfNotExists(dir);
    };

    var removeIfExists = function (fn) {
        try {
            Fs.unlinkSync(fn);
        } catch (err) {
            if (err.code !== "ENOENT") {
                throw err;
            }
        }
    };

    var logError = function (emitter, prefix) {
        // todo: log these only in verbose mode,
        // if ECONNRESET on tcp socket
        emitter.on("error", function (err) {
            console.error(prefix, err);
        });
    };

    var canonicalHeaders = function (rawHeaders) {
        var canonicalHeaders = [];
        var i;
        var key;
        var value;
        var parts;
        var canonicalParts;

        for (var i = 0; i < rawHeaders.length; i += 2) {
            key            = rawHeaders[i];
            value          = rawHeaders[i + 1];
            parts          = key.split("-");
            canonicalParts = [];

            for (var j = 0; j < parts.length; j++) {
                canonicalParts[j] = (
                    parts[j].substr(0, 1).toUpperCase() +
                    parts[j].substr(1)
                );
            }

            canonicalHeaders.push(canonicalParts.join("-"));
            canonicalHeaders.push(value);
        }

        return canonicalHeaders;
    };

    var cleanHeaders = function (message) {
        var headers    = canonicalHeaders(message.rawHeaders);
        var newHeaders = [];

        for (var i = 0; i < headers.length; i += 2) {
            var key = headers[i];
            switch (key) {
            case "Proxy-Connection":
            case "Strict-Transport-Security":
                break;
            case "Connection":
                newHeaders.push("Connection");
                newHeaders.push("close");
                break;
            default:
                newHeaders.push(headers[i]);
                newHeaders.push(headers[i + 1]);
                break;
            }
        }

        return newHeaders;
    };

    var parseUrl = function (req) {
        var url = Url.parse(req.url);
        if (req.headers.host) {
            url.host = req.headers.host;
        }

        return url;
    };

    var createInternalServer = function (options) {
        var server;
        if (options.useTls) {
            server = Https.createServer(options.serverOptions);
        } else {
            server = Http.createServer();
        }

        logError(server, options.errorLogPrefix);

        server.on("request", function (req, res) {
            logError(req, options.errorLogPrefix + " request");
            logError(res, options.errorLogPrefix + " response");

            cleanHeaders(req);

            var url = parseUrl(req);
            url.protocol = options.useTls ? "https:" : "http:";
            req.url = Url.format(url);

            options.client.emit("request", req, res);
        });

        return server;
    };

    var createHttpServer = function (client, errorLogPrefix) {
        return createInternalServer({
            client:         client,
            errorLogPrefix: errorLogPrefix
        });
    };

    var createHttpsServer = function (client, serverOptions, errorLogPrefix) {
        return createInternalServer({
            useTls:         true,
            client:         client,
            serverOptions:  serverOptions,
            errorLogPrefix: errorLogPrefix
        });
    };

    var isTunnelConnect = function (data) {
        // "C" from method CONNECT
        return data[0] === 67;
    };

    var isClientHello = function (data) {
        // tls handshake byte
        return data[0] === 22;
    };

    var getUnixSocketParams = function (head) {
        switch (true) {
        case isTunnelConnect(head):
            return {
                socketPathKey:  "tunnelConnect",
                errorLogPrefix: "tcp to tunnel unix socket"
            };
        case isClientHello(head):
            return {
                socketPathKey:  "https",
                errorLogPrefix: "tcp to https unix socket"
            };
        default:
            return {
                socketPathKey:  "http",
                errorLogPrefix: "tcp to http unix socket"
            };
        }
    };

    var createUnixSocket = function (options) {
        var unixSocket = Net.connect(options.path);
        logError(unixSocket, options.errorLogPrefix);

        unixSocket.write(options.head);
        options.tcpSocket.pipe(unixSocket);
        unixSocket.pipe(options.tcpSocket);
    };

    var createTcpServer = function (socketPaths) {
        var tcpServer = Net.createServer();
        logError(tcpServer, "tcp server");

        tcpServer.on("connection", function (socket) {
            logError(socket, "tcp server socket");

            socket.once("data", function (data) {
                var socketParams = getUnixSocketParams(data);

                createUnixSocket({
                    tcpSocket:      socket,
                    path:           socketPaths[socketParams.socketPathKey],
                    errorLogPrefix: socketParams.errorLogPrefix,
                    head:           data
                });
            });
        });

        return tcpServer;
    };

    var createTunnelConnect = function (dataSocketPath, errorLogPrefix) {
        var tunnel = Http.createServer();
        logError(tunnel, errorLogPrefix);

        tunnel.on("connect", function (req, socket, head) {
            logError(req, errorLogPrefix + " request");
            logError(socket, errorLogPrefix + " socket");

            var socketClosed     = false;
            var unixSocketClosed = false;
            var unixSocket       = Net.connect(dataSocketPath);

            logError(unixSocket, "tunnel connect unix socket");

            socket.write(
                "HTTP/1.1 200 Connection established\r\n\
                Proxy-Agent: reworse\r\n\r\n"
            );

            socket.on("data", function (data) {
                if (!unixSocketClosed) {
                    unixSocket.write(data);
                }
            });

            socket.on("end", function () {

                // otherwise unable to close nodejs server
                socket.destroy();

                socketClosed = true;
                unixSocket.end();
            });

            unixSocket.on("data", function (data) {
                if (!socketClosed) {
                    socket.write(data);
                }
            });

            unixSocket.on("end", function () {
                unixSocketClosed = true;
            });
        });

        return tunnel;
    };

    var createAllServers = function (client, tlsOptions, socketPaths) {
        return {
            tcpServer:     createTcpServer(socketPaths),
            http:          createHttpServer(client, "http"),
            https:         createHttpsServer(client, tlsOptions, "https"),
            tunnelData:    createHttpsServer(client, tlsOptions, "tunnel data"),
            tunnelConnect: createTunnelConnect(socketPaths.tunnelData, "tunnel connect")
        };
    };

    var listenOnAll = function (servers, socketPaths, port, clb) {
        servers.http.listen(socketPaths.http);
        servers.https.listen(socketPaths.https);
        servers.tunnelConnect.listen(socketPaths.tunnelConnect);
        servers.tunnelData.listen(socketPaths.tunnelData);
        servers.tcpServer.listen(port, clb);
    };

    var listen = function (listener, port, clb) {
        var socketPaths = getSocketPaths(listener.options.socketDir);
        var fileErr;
        try {
            ensureDir(listener.options.socketDir);
            Object.keys(socketPaths).map(
                function (key) {
                    return socketPaths[key];
                }
            ).forEach(removeIfExists);
        } catch (err) {
            fileErr = err;
        }

        if (fileErr) {
            listener.interface.emit("httpfallback", fileErr);
            listener.servers = {http: createHttpServer(listener.interface, "http fallback")};
            listener.servers.http.listen(port, clb);
            return;
        }

        var tlsOptions;
        if (listener.options.cert) {
            tlsOptions = {
                key:  listener.options.key,
                cert: listener.options.cert
            };
        } else {
            listener.interface.emit("fakecertificate");
            tlsOptions = FakeCert;
        }

        listener.servers = createAllServers(listener.interface, tlsOptions, socketPaths);
        listenOnAll(listener.servers, socketPaths, port, clb);
    };

    var closeAll = function (servers, clb) {
        var counter = 0;
        var clbi = function () {
            counter--;
            if (!counter) {
                clb();
            }
        };

        Object.keys(servers).forEach(function (name) {
            if (!servers[name]) {
                return;
            }

            counter++;
            servers[name].close(clbi);
        });
    };

    var close = function (listener, clb) {
        closeAll(listener.servers, clb);
    };

    var create = function (options) {
        options = options || {};
        options.socketDir = options.socketDir || defaultSocketDir;

        var listener = {
            options:   options,
            interface: new Interface
        };

        listener.interface.listen = function (port, clb) {
            listen(listener, port, clb);
        };

        listener.interface.close = function (clb) {
            close(listener, clb);
        };

        return listener.interface;
    };

    exports.createServer     = create;
    exports.cleanHeaders     = cleanHeaders;
    exports.canonicalHeaders = canonicalHeaders;
    exports.logError         = logError;
})();
