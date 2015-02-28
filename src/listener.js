(function () {
    "use strict";

    // todo: better var names

    var Cert   = require("./cert");
    var Events = require("events");
    var Fs     = require("fs");
    var Http   = require("http");
    var Https  = require("https");
    var Net    = require("net");
    var Path   = require("path");
    var Url    = require("url");
    var Util   = require("util");

    var defaultSocketDir             = ".tmp";
    var httpSocketName               = "http";
    var httpsSocketName              = "https";
    var httpsTunnelConnectSocketName = "https-tunnel-connect";
    var httpsTunnelDataSocketName    = "https-tunnel-data";

    var canonicalHeaders = function (message) {
        var canonicalHeaders = [];
        for (var i = 0; i < message.rawHeaders.length; i += 2) {
            var key = message.rawHeaders[i];
            var value = message.rawHeaders[i + 1];

            var parts = key.split("-");
            var canonicalParts = [];
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
        var headers = canonicalHeaders(message);
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

    var cleanRequest = function (req) {
        req.rawHeaders = cleanHeaders(req);
        if (!req.method) {
            req.method = "GET";
        }
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

    var ensureSocketPaths = function (socketDir) {
        var socketPaths = {
            http:               Path.join(socketDir, httpSocketName),
            https:              Path.join(socketDir, httpsSocketName),
            httpsTunnelConnect: Path.join(socketDir, httpsTunnelConnectSocketName),
            httpsTunnelData:    Path.join(socketDir, httpsTunnelDataSocketName)
        };

        ensureDir(socketDir);
        removeIfExists(socketPaths.http);
        removeIfExists(socketPaths.https);
        removeIfExists(socketPaths.httpsTunnelConnect);
        removeIfExists(socketPaths.httpsTunnelData);

        return socketPaths;
    };

    var ensureSocketPathsSafe = function (socketDir) {
        try {
            return ensureSocketPaths(socketDir);
        } catch (err) {
            return {err: err};
        }
    };

    var logError = function (emitter, prefix) {
        emitter.on("error", function (err) {
            console.error(prefix, err);
        });
    };

    var httpFallback = function (server, port, clb) {
        server.http = Http.createServer();
        logError(server.http, "http fallback server");

        server.http.on("request", function (req, res) {
            logError(req, "http fallback request");
            logError(res, "http fallback response");

            cleanRequest(req);
            proxy.emit("request", req, res);
        });

        server.http.listen(port, clb);
    };

    var isClientHello = function (data) {
        // tls handshake byte
        return data[0] === 22;
    };

    var isTunnelConnect = function (data) {
        // "C" from method CONNECT
        return data[0] === 67;
    };

    var createTcpServer = function (server) {
        server.net = Net.createServer();
        logError(server.net, "tcp server");

        server.net.on("connection", function (socket) {
            logError(socket, "tcp socket");

            socket.once("data", function (data) {
                switch (true) {
                case isTunnelConnect(data):
                    var unixSocket = Net.connect(
                        server.socketPaths.httpsTunnelConnect
                    );
                    logError(unixSocket, "tcp connect unix socket");

                    unixSocket.write(data);
                    socket.pipe(unixSocket);
                    unixSocket.pipe(socket);
                    break;
                case isClientHello(data):
                    var unixSocket = Net.connect(
                        server.socketPaths.https
                    );
                    logError(unixSocket, "tcp hello unix socket");

                    unixSocket.write(data);
                    socket.pipe(unixSocket);
                    unixSocket.pipe(socket);
                    break;
                default:
                    var unixSocket = Net.connect(
                        server.socketPaths.http
                    );
                    logError(unixSocket, "tcp unix socket");

                    unixSocket.write(data);
                    socket.pipe(unixSocket);
                    unixSocket.pipe(socket);
                    break;
                }
            });
        });
    };

    var createHttpServer = function (server) {
        server.http = Http.createServer();
        logError(server.http, "http server");

        server.http.on("request", function (req, res) {
            logError(req, "http request");
            logError(res, "http response");

            cleanRequest(req);
            server.proxy.emit("request", req, res);
        });
    };

    var createHttpsServer = function (server) {
        var httpsOptions = {};
        if (server.options.key) {
            httpsOptions.key = server.options.key;
            httpsOptions.cert = server.options.cert;
        } else {
            server.proxy.emit("fakecertificate");
            httpsOptions.key = Cert.key;
            httpsOptions.cert = Cert.cert;
        }

        server.https = Https.createServer(httpsOptions);
        logError(server.https, "https server");

        server.https.on("request", function (req, res) {
            logError(req, "https request");
            logError(res, "https response");

            cleanRequest(req);

            var url = Url.parse(req.url);
            if (req.headers.host) {
                url.host = req.headers.host;
            }

            url.protocol = "https:";
            req.url = Url.format(url);

            server.proxy.emit("request", req, res);
        });
    };

    var createHttpsTunnelDataServer = function (server) {
        var httpsOptions = {};
        if (server.options.key) {
            httpsOptions.key = server.options.key;
            httpsOptions.cert = server.options.cert;
        } else {
            server.proxy.emit("fakecertificate");
            httpsOptions.key = Cert.key;
            httpsOptions.cert = Cert.cert;
        }

        server.httpsTunnelData = Https.createServer(httpsOptions);
        logError(server.httpsTunnelData, "https tunnel data server");

        server.httpsTunnelData.on("request", function (req, res) {
            logError(req, "https tunnel data request");
            logError(res, "https tunnel data response");

            cleanRequest(req);
            req.reworse = {tunnel: true};

            var url = Url.parse(req.url);
            if (req.headers.host) {
                url.host = req.headers.host;
            }

            url.protocol = "https:";
            req.url = Url.format(url);

            server.proxy.emit("request", req, res);
        });
    };

    var padHexa = function (hexa) {
        if (hexa.length === 2) {
            return hexa;
        }

        return "0" + hexa;
    };

    var printHexa = function (buffer) {
        console.error("length:", buffer.length);
        console.error.apply(console, [].map.call(buffer, function (byte) {
            return padHexa(byte.toString(16));
        }));
    };

    var createHttpsTunnelConnectServer = function (server) {
        var tunnel = Http.createServer();
        logError(tunnel, "https tunnel connect server");

        tunnel.on("upgrade", function (req, socket, head) {
            logError(req, "https tunnel connect request");
            logError(socket, "https tunnel connect socket");

            var socketClosed = false;
            var unixSocketClosed = false;

            var unixSocket = Net.connect(
                server.socketPaths.httpsTunnelData
            );

            logError(unixSocket, "https tunnel connect unix socket");

            // unixSocket.write(head);
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

        server.httpsTunnelConnect = tunnel;
    };

    var createAllServers = function (server) {
        createTcpServer(server);
        createHttpServer(server);
        createHttpsServer(server);
        createHttpsTunnelConnectServer(server);
        createHttpsTunnelDataServer(server);
    };

    var listenOnAll = function (server, port, clb) {
        createAllServers(server);
        server.http.listen(server.socketPaths.http);
        server.https.listen(server.socketPaths.https);
        server.httpsTunnelConnect.listen(server.socketPaths.httpsTunnelConnect);
        server.httpsTunnelData.listen(server.socketPaths.httpsTunnelData);
        server.net.listen(port, clb);
    };

    var listen = function (server, port, clb) {
        var socketPaths = ensureSocketPathsSafe(server.options.socketDir);
        if (socketPaths.err) {
            server.proxy.emit("httpfallback", socketPaths.err);
            httpFallback(server, port, clb);
        } else {
            server.socketPaths = socketPaths;
            listenOnAll(server, port, clb);
        }
    };

    var closeAll = function (servers, clb) {
        var counter = 0;
        var clbi = function () {
            counter--;
            if (!counter) {
                clb();
            }
        };

        servers.forEach(function (server) {
            if (!server) {
                return;
            }

            counter++;
            server.close(clbi);
        });
    };

    var close = function (server, clb) {
        closeAll([
            server.net,
            server.http,
            server.https,
            server.httpsTunnelConnect,
            server.httpsTunnelData
        ], clb);
    };

    var Proxy = function () {
        Events.EventEmitter.call(this);
    };

    Util.inherits(Proxy, Events.EventEmitter);

    var create = function (options) {
        if (options === undefined) {
            options = {};
        }

        if (options.socketDir === undefined) {
            options.socketDir = defaultSocketDir;
        }

        var server = {
            options: options,
            proxy: new Proxy
        };

        server.proxy.listen = function (port, clb) {
            listen(server, port, clb);
        };

        server.proxy.close = function (clb) {
            close(server, clb);
        };

        return server.proxy;
    };

    exports.createServer = create;
    exports.cleanHeaders = cleanHeaders;
    exports.logError     = logError;
})();
