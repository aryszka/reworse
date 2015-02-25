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

    var copyEvent = function (source, proxy, name) {
        source.on(name, function () {
            var args = [].slice.call(arguments);
            args.unshift(name);
            proxy.emit.apply(proxy, args);
        });
    };

    var httpFallback = function (server, port, clb) {
        server.http = Http.createServer();
        copyEvent(server.http, server.proxy, "request");
        server.http.listen(port, clb);
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
        server.https.on("error", function (err) {
            // console.error("https error", err);
        });
        server.https.on("request", function (req, res) {
            // console.error("original https request", req.url, req.headers);

            req.on("error", function (err) {
                // console.error("https request error", err);
            });

            res.on("error", function (err) {
                // console.error("https response error", err);
            });

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
        server.httpsTunnelData.on("error", function (err) {
            // console.error("tunnel data error", err);
        });
        server.httpsTunnelData.on("request", function (req, res) {
            // console.error("original tunnel request", req.url, req.headers);

            req.on("error", function (err) {
                // console.error("tunnel data request error", err);
            });

            res.on("error", function (err) {
                // console.error("tunnel response error", err);
            });

            req.on("end", function () {
                // console.error("tunnel data request end");
            });

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
        return;
        console.error("length:", buffer.length);
        console.error.apply(console, [].map.call(buffer, function (byte) {
            return padHexa(byte.toString(16));
        }));
    };

    var createHttpsTunnelConnectServer = function (server) {
        var tunnel = Http.createServer();

        tunnel.on("error", function (err) {
            // console.error("tunnel connect error", err);
        });

        tunnel.on("upgrade", function (req, socket, head) {
            // console.error("tunnel upgrade", head[0] === 22, head.toString(), req.headers);
            var keepAlive = req.headers["proxy-connection"].toLowerCase() === "keep-alive";
            var unixSocketClosed = false;

            socket.on("close", function () {
                // console.error("tunnel socket closed");
            });

            req.on("error", function (err) {
                // console.error("tunnel connect request error", err);
            });

            socket.on("error", function (err) {
                // console.error("tunnel connect socket error", err);
            });

            var unixSocket = Net.connect(
                server.socketPaths.httpsTunnelData
            );

            unixSocket.on("close", function () {
                // console.error("tunnel unix socket closed");
            });

            unixSocket.on("error", function (err) {
                // console.error("tunnel connect unix socket error", err);
            });

            // unixSocket.write(head);
            socket.write(
                "HTTP/1.1 200 Connection established\r\n\
                Proxy-Agent: reworse\r\n\r\n"
            );

            req.on("data", function (data) {
                // console.error("request data");
                // unixSocket.write(data);
            });

            req.on("end", function () {
                // console.error("tunnel request end");
                // unixSocket.end();
            });

            socket.on("data", function (data) {
                // console.error("socket data");
                // printHexa(data);
                if (!unixSocketClosed) {
                    // console.error("writing unix socket");
                    unixSocket.write(data);
                } else {
                    printHexa(data);
                }
            });

            socket.on("end", function () {
                // console.error("tunnel socket end");
                unixSocket.end();
            });

            unixSocket.on("data", function (data) {
                // console.error("unix socket data");
                // printHexa(data);
                socket.write(data);
            });

            unixSocket.on("end", function () {
                // console.error("unix socket end");
                unixSocketClosed = true;
                // socket.end();
            });

            // req.pipe(unixSocket);
            // socket.pipe(unixSocket);
            // unixSocket.pipe(socket);
        });

        tunnel.on("request", function (req) {
            // console.error("tunnel request");

            req.on("error", function (err) {
                // console.error("tunnel request error", err);
            });

            req.on("end", function () {
                // console.error("tunnel request end");
            });
        });

        tunnel.on("end", function () {
            // console.error("tunnel end");
        });

        server.httpsTunnelConnect = tunnel;
    };

    var createAllServers = function (server) {
        server.net = Net.createServer();
        server.http = Http.createServer();
        server.http.on("request", function (req, res) {
            console.error("listener request", req.method);
            delete req.headers["proxy-connection"];
            if (!req.method) {
                req.method = "GET";
            }
            server.proxy.emit("request", req, res);
        });
        createHttpsServer(server);
        createHttpsTunnelConnectServer(server);
        createHttpsTunnelDataServer(server);

        server.net.on("error", function (err) {
            // console.error("raw server error", err);
        });
    };

    var isClientHello = function (data) {
        // tls handshake byte
        return data[0] === 22;
    };

    var isTunnelConnect = function (data) {
        // "C" from method CONNECT
        return data[0] === 67;
    };

    var listenOnAll = function (server, port, clb) {
        createAllServers(server);
        // copyEvent(server.http, server.proxy, "request");
        // copyEvent(server.https, server.proxy, "request");

        // console.error("listening");
        server.net.on("connection", function (socket) {
            // console.error("connection");

            socket.on("close", function () {
                // console.error("raw socket closed");
            });

            socket.once("data", function (data) {
                switch (true) {
                case isClientHello(data):
                    var unixSocket = Net.connect(
                        server.socketPaths.https
                    );
                    unixSocket.write(data);
                    socket.pipe(unixSocket);
                    unixSocket.pipe(socket);
                    break;
                case isTunnelConnect(data):
                    // console.error("tunnel connect detected");

                    socket.on("error", function (err) {
                        // console.error("raw socket error", err);
                    });

                    socket.on("data", function (data) {
                        if (data[0] === 21) {
                            // console.error("alert detected");
                        }
                    });

                    var unixSocket = Net.connect(
                        server.socketPaths.httpsTunnelConnect
                    );

                    unixSocket.on("close", function () {
                        // console.error("raw unix socket closed");
                    });

                    unixSocket.write(data);
                    socket.pipe(unixSocket);
                    unixSocket.pipe(socket);
                    break;
                default:
                    console.error("standard connection");
                    var unixSocket = Net.connect(
                        server.socketPaths.http
                    );
                    unixSocket.write(data);
                    socket.pipe(unixSocket);
                    unixSocket.pipe(socket);
                    break;
                }
            });

            socket.on("end", function () {
                // console.error("raw socket end");
            });
        });

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

    module.exports.createServer = create;
})();
