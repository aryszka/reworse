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
        var origin;
        var relayAddress;
        var relaySocket;

        switch (true) {
        case isTunnelConnect(data):
            origin       = externalServerOrigin + "-tunnelconnect";
            relayAddress = options.socketPaths.tunnelConnect;
            break;
        case isClientHello(data):
            origin       = externalServerOrigin + "-internalhttps";
            relayAddress = options.socketPaths.https;
            break;
        default:
            origin       = externalServerOrigin + "-internalhttp";
            relayAddress = options.socketPaths.http;
            break;
        }

        var relaySocket = Net.connect(relayAddress);
        Errors.map(relaySocket, options.events, origin);

        relaySocket.write(data);
        socket.pipe(relaySocket);
        relaySocket.pipe(socket);
    };

    var externalConnection = function (socket, options) {
        socket.once("data", function (data) {
            externalDataStart(socket, data, options);
        });
    };

    // creates a tcp listener to accept connections coming
    // from outside. returns an instance of the standard
    // Net.Server type.
    //
    // options:
    // - events:  event emitter to map communication errors to
    // - address: port to listen on (alternatively path for
    //            unix sockets)
    var createExternalServer = function (options) {
        // todo: log errors here only in verbose mode,
        //       if ECONNRESET on tcp socket

        var server = Net.createServer();
        Errors.map(server, options.events, externalServerOrigin);

        server.address = options.address;

        server.on("connection", function (socket) {
            Errors.map(
                socket,
                options.events,
                externalServerOrigin + "-socket"
            );

            externalConnection(socket, options);
        });

        return server;
    };

    var applyFinalHost = function (req) {
        var url = Url.parse(req.url);

        if (req.headers.host) {
            url.host = req.headers.host;
        }

        return url;
    };

    var internalRequest = function (req, res, options) {
        var url = applyFinalHost(req);
        url.protocol = options.useTls ? "https:" : "http:";
        req.url = Url.format(url);

        options.events.emit("request", req, res);
    };

    // creates an internal http server to parse the incoming
    // requests. returns an instance either of the standard
    // Http.Server or Https.Server.
    //
    // options:
    // - useTls:  flag indicating whether to create an https
    //            server
    // - tlsCert: if using tls, the rsa key and the
    //            certificate to be used
    // - address: the port or the unix socket to listen on
    // - events:  an event emitter to map the communication
    //            errors and the incoming http requests
    // - origin:  additional origin flag to use for the
    //            errors
    var createInternalHttp = function (options) {
        options = options || {};

        var server;
        if (options.useTls) {
            server = Https.createServer(options.tlsCert);
        } else {
            server = Http.createServer();
        }

        Errors.map(server, options.events, options.origin);

        server.address = options.address;

        server.on("request", function (req, res) {
            Errors.map(req, options.events, options.origin + "-request");
            Errors.map(res, options.events, options.origin + "-response");

            internalRequest(req, res, options);
        });

        return server;
    };

    var tunnelConnection = function (req, socket, options) {
        var socketClosed     = false;
        var tunnelDataClosed = false;
        var tunnelData       = Net.connect(options.dataPath);

        Errors.map(
            tunnelData,
            options.events,
            tunnelConnectOrigin + "-data"
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

    // creates a tunneling server to handle proxy tunneling
    // requests and forward them to an internal http server.
    // returns an instance of the standard Http.Server.
    //
    // options:
    // - events:   an event emitter to forward the
    //             communication errors to
    // - address:  address (port or socket path) to listen on
    // - dataPath: the unix socket path, to forward the
    //             incoming requests to
    var createTunnelConnect = function (options) {
        var origin = tunnelConnectOrigin;
        var tunnel = Http.createServer();

        Errors.map(tunnel, options.events, origin);

        tunnel.address = options.address;

        tunnel.on("connect", function (req, socket) {
            Errors.map(req, options.events,origin + "-request");
            Errors.map(socket, options.events, origin + "-socket");
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
