(function () {
    "use strict";

    var Errors  = require("./errors");
    var Headers = require("./headers");
    var Http    = require("http");
    var Https   = require("https");
    var Net     = require("net");
    var Url     = require("url");

    var externalServerOrigin = "externalserver";
    var tunnelConnectOrigin  = "tunnelconnect";

    var isTunnelConnect = function (data) {
        // "C" from method CONNECT
        return data[0] === 67;
    };

    var isClientHello = function (data) {
        // tls handshake byte
        return data[0] === 22;
    };

    var externalDataStart = function (socket, data, options) {
        var relayAddress;
        var relaySocket;
        var origin;

        switch (true) {
        case isTunnelConnect(data):
            relayAddress = options.socketPaths.tunnelConnect;
            origin         = externalServerOrigin + "-tunnelconnect";
            break;
        case isClientHello(data):
            relayAddress = options.socketPaths.https;
            origin         = externalServerOrigin + "-internalhttps";
            break;
        default:
            relayAddress = options.socketPaths.http;
            origin         = externalServerOrigin + "-internalhttp";
            break;
        }

        var relaySocket = Net.connect(relayAddress);
        Errors.forward(origin, relaySocket, options.events);

        relaySocket.write(data);
        socket.pipe(relaySocket);
        relaySocket.pipe(socket);
    };

    var externalConnection = function (socket, options) {
        socket.once("data", function (data) {
            externalDataStart(socket, data, options);
        });
    };

    var createExternalServer = function (options) {
        // todo: log errors here only in verbose mode,
        // if ECONNRESET on tcp socket

        var server = Net.createServer();
        Errors.forward(externalServerOrigin, server, options.events);

        server.address = options.address;
        server.on("connection", function (socket) {
            Errors.forward(
                externalServerOrigin + "-socket",
                socket,
                options.events
            );

            externalConnection(socket, options);
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

    var internalRequest = function (req, res, options) {
        Errors.forward(options.origin + "-request", req, options.events);
        Errors.forward(options.origin + "-response", res, options.events);

        Headers.conditionMessage(req);

        var url = parseUrl(req);
        url.protocol = options.useTls ? "https:" : "http:";
        req.url = Url.format(url);

        options.events.emit("request", req, res);
    };

    var createInternalHttp = function (options) {
        options = options || {};

        var server;
        if (options.useTls) {
            server = Https.createServer(options.tlsCert);
        } else {
            server = Http.createServer();
        }

        Errors.forward(options.origin, server, options.events);

        server.address = options.address;
        server.on("request", function (req, res) {
            internalRequest(req, res, options);
        });

        return server;
    };

    var tunnelConnection = function (req, socket, options) {
        var socketClosed     = false;
        var tunnelDataClosed = false;

        var tunnelData = Net.connect(options.dataPath);
        Errors.forward(
            tunnelConnectOrigin + "-data",
            tunnelData,
            options.events
        );

        socket.write(
            "HTTP/1.1 200 Connection established\r\n" +
            "Proxy-Agent: reworse\r\n\r\n"
        );

        socket.on("data", function (data) {
            if (!tunnelDataClosed) {
                tunnelData.write(data);
            }
        });

        socket.on("end", function () {

            // otherwise unable to close nodejs server
            socket.destroy();

            socketClosed = true;
            tunnelData.end();
        });

        tunnelData.on("data", function (data) {
            if (!socketClosed) {
                socket.write(data);
            }
        });

        tunnelData.on("end", function () {
            tunnelDataClosed = true;
        });
    };

    var createTunnelConnect = function (options) {
        var origin = tunnelConnectOrigin;
        var tunnel = Http.createServer();

        Errors.forward(origin, tunnel, options.events);

        tunnel.address = options.address;

        tunnel.on("connect", function (req, socket) {
            Errors.forward(origin + "-request", req, options.events);
            Errors.forward(origin + "-socket", socket, options.events);
            tunnelConnection(req, socket, options);
        });

        return tunnel;
    };

    module.exports = {
        createExternalServer: createExternalServer,
        createInternalHttp:   createInternalHttp,
        createTunnelConnect:  createTunnelConnect,
        externalServerOrigin: externalServerOrigin,
        tunnelConnectOrigin:  tunnelConnectOrigin
    };
})();
