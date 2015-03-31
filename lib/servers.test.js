suite("servers", function () {
    "use strict";

    var assert   = require("assert");
    var Events   = require("events");
    var FakeCert = require("./fake-cert");
    var Headers  = require("./headers");
    var Http     = require("http");
    var Https    = require("https");
    var Net      = require("net");
    var Servers  = require("./servers");

    var connect;
    var httpCreateServer;
    var httpsCreateServer;

    var noop = function () {};

    var testSocket = function () {
        var socket = new Events.EventEmitter;

        socket.write   = noop;
        socket.end     = noop;
        socket.destroy = noop;

        socket.pipe = function (s) {
            socket.pipedTo = s;
            socket.emit("piped", s);
        };

        return socket;
    };

    var testRequest = function () {
        var request = new Events.EventEmitter;

        request.rawHeaders = [];
        request.headers    = {};
        request.url        = "";

        return request;
    };

    setup(function () {
        connect           = Net.connect;
        httpCreateServer  = Http.createServer;
        httpsCreateServer = Https.createServer;
    });

    teardown(function () {
        Net.connect        = connect;
        Http.createServer  = httpCreateServer;
        Https.createServer = httpsCreateServer;
    });

    test("external server forwards errors", function (done) {
        var events    = new Events.EventEmitter;
        var server    = Servers.createExternalServer({events: events});
        var testError = "test error";

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin === Servers.externalServerOrigin);
            done();
        });

        server.emit("error", testError);
    });

    test("external server forwards connection errors", function (done) {
        var events    = new Events.EventEmitter;
        var socket    = testSocket();
        var server    = Servers.createExternalServer({events: events});
        var testError = "test error";

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin.indexOf(Servers.externalServerOrigin) === 0);
            done();
        });

        server.emit("connection", socket);
        socket.emit("error", testError);
    });

    test("external server stores address", function () {
        var address = "test-address";
        var server  = Servers.createExternalServer({address: address});

        assert(server.address === address);
    });

    test("external server relays tunnel connect", function (done) {
        var data               = new Buffer("CONNECT");
        var events             = new Events.EventEmitter;
        var testPath           = "test-path";
        var socket             = testSocket();
        var relaySocket        = testSocket();
        var initialWriteCalled = false;

        var options = {
            events:      events,
            socketPaths: {tunnelConnect: testPath}
        };

        var server = Servers.createExternalServer(options);

        var onPiped = function () {
            assert(!socket.pipedTo || socket.pipedTo === relaySocket);
            assert(!relaySocket.pipedTo || relaySocket.pipedTo === socket);
            if (socket.pipedTo && relaySocket.pipedTo) {
                assert(initialWriteCalled);
                done();
            }
        };

        socket.on("piped", onPiped);
        relaySocket.on("piped", onPiped);

        relaySocket.write = function (d) {
            initialWriteCalled = true;
            assert(d === data);
        };

        Net.connect = function (address) {
            assert(address === testPath);
            return relaySocket;
        };

        server.emit("connection", socket);
        socket.emit("data", data);
    });

    test("external server relays tls connections", function (done) {
        var data               = new Buffer([22, 23, 23]);
        var events             = new Events.EventEmitter;
        var testPath           = "test-path";
        var socket             = testSocket();
        var relaySocket        = testSocket();
        var initialWriteCalled = false;

        var options = {
            events:      events,
            socketPaths: {https: testPath}
        };

        var server = Servers.createExternalServer(options);

        var onPiped = function () {
            assert(!socket.pipedTo || socket.pipedTo === relaySocket);
            assert(!relaySocket.pipedTo || relaySocket.pipedTo === socket);
            if (socket.pipedTo && relaySocket.pipedTo) {
                assert(initialWriteCalled);
                done();
            }
        };

        socket.on("piped", onPiped);
        relaySocket.on("piped", onPiped);

        relaySocket.write = function (d) {
            initialWriteCalled = true;
            assert(d === data);
        };

        Net.connect = function (address) {
            assert(address === testPath);
            return relaySocket;
        };

        server.emit("connection", socket);
        socket.emit("data", data);
    });

    test("external server relays non tls connections", function (done) {
        var data               = new Buffer("123");
        var events             = new Events.EventEmitter;
        var testPath           = "test-path";
        var socket             = testSocket();
        var relaySocket        = testSocket();
        var initialWriteCalled = false;

        var options = {
            events:      events,
            socketPaths: {http: testPath}
        };

        var server = Servers.createExternalServer(options);

        var onPiped = function () {
            assert(!socket.pipedTo || socket.pipedTo === relaySocket);
            assert(!relaySocket.pipedTo || relaySocket.pipedTo === socket);
            if (socket.pipedTo && relaySocket.pipedTo) {
                assert(initialWriteCalled);
                done();
            }
        };

        socket.on("piped", onPiped);
        relaySocket.on("piped", onPiped);

        relaySocket.write = function (d) {
            initialWriteCalled = true;
            assert(d === data);
        };

        Net.connect = function (address) {
            assert(address === testPath);
            return relaySocket;
        };

        server.emit("connection", socket);
        socket.emit("data", data);
    });

    test("external server forwards relay socket errors", function (done) {
        var events        = new Events.EventEmitter;
        var socket        = testSocket();
        var forwardSocket = testSocket();
        var testError     = "test error";

        var options = {
            events:      events,
            socketPaths: {tunnelConnect: "test-path"}
        };

        var server = Servers.createExternalServer(options);

        Net.connect = function (address) {
            return forwardSocket;
        };

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin.indexOf(Servers.externalServerOrigin) === 0);

            done();
        });

        server.emit("connection", socket);
        socket.emit("data", new Buffer("123"));
        forwardSocket.emit("error", testError);
    });

    test("internal server does not use tls by default", function () {
        var httpServer = new Events.EventEmitter;

        Http.createServer = function () {
            return httpServer;
        };

        var server = Servers.createInternalHttp();
        assert(server === httpServer);
    });

    test("internal server uses tls when specified", function () {
        var httpsServer = new Events.EventEmitter;

        Https.createServer = function () {
            return httpsServer;
        };

        var server = Servers.createInternalHttp({useTls: true});
        assert(server === httpsServer);
    });

    test("internal server forwards errors", function (done) {
        var testError  = "test error";
        var testOrigin = "test origin";
        var events     = new Events.EventEmitter;

        var server = Servers.createInternalHttp({
            events: events,
            origin: testOrigin
        });

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin === testOrigin);

            done();
        });

        server.emit("error", testError);
    });

    test("internal server stores address", function () {
        var testAddress = "test-address";
        var server      = Servers.createInternalHttp({address: testAddress});

        assert(server.address === testAddress);
    });

    test("internal server forwards request errors", function (done) {
        var testError  = "test error";
        var testOrigin = "test origin";
        var events     = new Events.EventEmitter;
        var request    = testRequest();

        var server = Servers.createInternalHttp({
            events: events,
            origin: testOrigin
        });

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin.indexOf(testOrigin) === 0);

            done();
        });

        server.emit("request", request, new Events.EventEmitter);
        request.emit("error", testError);
    });

    test("internal server forwards response errors", function (done) {
        var testError  = "test error";
        var testOrigin = "test origin";
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var response   = new Events.EventEmitter;

        var server = Servers.createInternalHttp({
            events: events,
            origin: testOrigin
        });

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin.indexOf(testOrigin) === 0);

            done();
        });

        server.emit("request", request, response);
        response.emit("error", testError);
    });

    test("internal server ensures request protocol when no tls", function (done) {
        var events  = new Events.EventEmitter;
        var request = testRequest();
        var called  = false;
        var server  = Servers.createInternalHttp({events: events});

        events.on("request", function () {
            assert(request.url.indexOf("http:") === 0);
            done();
        });

        server.emit("request", request, new Events.EventEmitter);
    });

    test("internal server ensures request protocol when tls", function (done) {
        var events  = new Events.EventEmitter;
        var request = testRequest();
        var called  = false;

        var server = Servers.createInternalHttp({
            events:  events,
            useTls:  true,
            tlsCert: FakeCert
        });

        events.on("request", function () {
            assert(request.url.indexOf("https:") === 0);
            done();
        });

        server.emit("request", request, new Events.EventEmitter);
    });

    test("internal server forwards requests", function (done) {
        var events   = new Events.EventEmitter;
        var request  = testRequest();
        var response = new Events.EventEmitter;
        var called   = false;
        var server   = Servers.createInternalHttp({events:  events});

        events.on("request", function (req, res) {
            assert(req === request);
            assert(res === response);
            done();
        });

        server.emit("request", request, response);
    });

    test("tunnel connect forwards errors", function (done) {
        var events    = new Events.EventEmitter;
        var testError = "test error";
        var tunnel    = Servers.createTunnelConnect({events: events});

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin === Servers.tunnelConnectOrigin);

            done();
        });

        tunnel.emit("error", testError);
    });

    test("tunnel connect stores address", function () {
        var testAddress = "test-address";
        var tunnel      = Servers.createTunnelConnect({address: testAddress});

        assert(tunnel.address === testAddress);
    });

    test("tunnel connect forwards connect errors", function (done) {
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var testError  = "test error";
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin.indexOf(Servers.tunnelConnectOrigin) === 0);

            done();
        });

        tunnel.emit("connect", request, socket);
        request.emit("error", testError);
    });

    test("tunnel connect forwards socket errors", function (done) {
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var testError  = "test error";
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin.indexOf(Servers.tunnelConnectOrigin) === 0);

            done();
        });

        tunnel.emit("connect", request, socket);
        socket.emit("error", testError);
    });

    test("tunnel connect forwards tunnel data errors", function (done) {
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var testError  = "test error";
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        events.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin.indexOf(Servers.tunnelConnectOrigin) === 0);

            done();
        });

        tunnel.emit("connect", request, socket);
        tunnelData.emit("error", testError);
    });

    test("tunnel connect responds connection established", function (done) {
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        socket.write = function (data) {
            assert(
                data.toString() ===
                "HTTP/1.1 200 Connection established\r\n" +
                "Proxy-Agent: reworse\r\n\r\n"
            );

            done();
        };

        tunnel.emit("connect", request, socket);
    });

    test("tunnel connect does not write on data when it is closed", function () {
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        tunnelData.write = function () {
            assert(false);
        };

        tunnel.emit("connect", request, socket);
        tunnelData.emit("end");
        socket.emit("data", new Buffer("123"));
    });

    test("tunnel connect does not write on socket when it is closed", function (done) {
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        socket.write = function (data) {
            assert(
                data.toString() ===
                "HTTP/1.1 200 Connection established\r\n" +
                "Proxy-Agent: reworse\r\n\r\n"
            );

            done();
        };

        tunnel.emit("connect", request, socket);
        socket.emit("end");
        tunnelData.emit("data", new Buffer("123"));
    });

    test("tunnel connect copies request data to tunnel data", function (done) {
        var data       = new Buffer("123");
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        tunnelData.write = function (d) {
            assert(d === data);
            done();
        };

        tunnel.emit("connect", request, socket);
        socket.emit("data", data);
    });

    test("tunnel connect copies response data to socket", function (done) {
        var data       = new Buffer("123");
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        socket.write = function (d) {
            if (
                d.toString() ===
                "HTTP/1.1 200 Connection established\r\n" +
                "Proxy-Agent: reworse\r\n\r\n"
            ) {
                return;
            }

            assert(d === data);
            done();
        };

        tunnel.emit("connect", request, socket);
        tunnelData.emit("data", data);
    });

    test("tunnel connect closes data on socket end", function (done) {
        var data       = new Buffer("123");
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        tunnelData.end = function () {
            done();
        };

        tunnel.emit("connect", request, socket);
        socket.emit("end");
    });

    test("tunnel connect destroys socket on socket end", function (done) {
        // otherwise unable to close nodejs server

        var data       = new Buffer("123");
        var events     = new Events.EventEmitter;
        var request    = testRequest();
        var tunnelData = testSocket();
        var socket     = testSocket();
        var tunnel     = Servers.createTunnelConnect({events: events});

        Net.connect = function () {
            return tunnelData;
        };

        socket.destroy = function () {
            done();
        };

        tunnel.emit("connect", request, socket);
        socket.emit("end");
    });
});
