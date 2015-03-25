(function () {
    "use strict";

    var Errors  = require("./errors");
    var Headers = require("./headers");
    var Http    = require("http");
    var Https   = require("https");
    var Net     = require("net");
    var Url     = require("url");

    var isTunnelConnect = function (data) {
        // "C" from method CONNECT
        return data[0] === 67;
    };

    var isClientHello = function (data) {
        // tls handshake byte
        return data[0] === 22;
    };

    var createExternalServer = function (options) {
        // todo: log errors here only in verbose mode,
        // if ECONNRESET on tcp socket

        var server = Net.createServer();
        Errors.forward("external server", server, options.errors);

        server.address = options.address;

        server.on("connection", function (socket) {
            Errors.forward("tcp server socket", socket, options.errors);

            socket.once("data", function (data) {
                var forwardAddress;
                var forwardSocket;
                var errorOrigin;

                switch (true) {
                case isTunnelConnect(data):
                    forwardAddress = options.socketPaths.tunnelConnect;
                    errorOrigin    = "tcp to tunnel unix socket";
                    break;
                case isClientHello(data):
                    forwardAddress = options.socketPaths.https;
                    errorOrigin    = "tcp to https unix socket";
                    break;
                default:
                    forwardAddress = options.socketPaths.http;
                    errorOrigin    = "tcp to http unix socket";
                    break;
                }

                var forwardSocket = Net.connect(forwardAddress);
                Errors.forward(errorOrigin || "socket", socket, options.errors);

                forwardSocket.write(data);
                socket.pipe(forwardSocket);
                forwardSocket.pipe(socket);
            });
        });

        return server;
    };

    var parseUrl = function (req) {
        var url = Url.parse(req.url);
        if (req.headers.host) {
            url.host = req.headers.host;
        }

        return url;
    };

    var createInternalHttp = function (options) {
        var server;
        if (options.useTls) {
            server = Https.createServer(options.tlsCert);
        } else {
            server = Http.createServer();
        }

        Errors.forward(options.errorOrigin, server, options.events);

        server.address = options.address;

        server.on("request", function (req, res) {
            Errors.forward(options.errorOrigin + " request", req, options.events);
            Errors.forward(options.errorOrigin + " response", res, options.events);

            Headers.conditionMessage(req);

            var url = parseUrl(req);
            url.protocol = options.useTls ? "https:" : "http:";
            req.url = Url.format(url);

            options.events.emit("request", req, res);
        });

        return server;
    };

    var createTunnelConnect = function (options) {
        var errorOrigin = "tunnel connect";
        var tunnel = Http.createServer();
        Errors.forward(errorOrigin, tunnel, options.errors);

        tunnel.address = options.address;

        tunnel.on("connect", function (req, socket, head) {
            Errors.forward(errorOrigin + " request", req, options.errors);
            Errors.forward(errorOrigin + " socket", socket, options.errors);

            var socketClosed     = false;
            var unixSocketClosed = false;
            var unixSocket       = Net.connect(options.dataPath);

            Errors.forward("tunnel connect unix socket", unixSocket, options.errors);

            socket.write(
                "HTTP/1.1 200 Connection established\r\n" +
                "Proxy-Agent: reworse\r\n\r\n"
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

    module.exports = {
        createExternalServer: createExternalServer,
        createInternalHttp:   createInternalHttp,
        createTunnelConnect:  createTunnelConnect
    };
})();
