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
        var socket    = new Events.EventEmitter;
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
        var connect            = Net.connect;
        var data               = new Buffer("CONNECT");
        var events             = new Events.EventEmitter;
        var testPath           = "test-path";
        var socket             = new Events.EventEmitter;
        var relaySocket        = new Events.EventEmitter;
        var socketPiped        = false;
        var relaySocketPiped   = false;
        var initialWriteCalled = false;

        var options = {
            events:      events,
            socketPaths: {tunnelConnect: testPath}
        };

        var server = Servers.createExternalServer(options);

        var pipe = function (s) {
            if (s === socket) {
                socketPiped = true;
            }

            if (s === relaySocket) {
                relaySocketPiped = true;
            }

            if (socketPiped && relaySocketPiped) {
                Net.connect = connect;
                assert(initialWriteCalled);
                done();
            }
        };

        socket.pipe      = pipe;
        relaySocket.pipe = pipe;

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
        var connect            = Net.connect;
        var data               = new Buffer([22, 23, 23]);
        var events             = new Events.EventEmitter;
        var testPath           = "test-path";
        var socket             = new Events.EventEmitter;
        var relaySocket        = new Events.EventEmitter;
        var socketPiped        = false;
        var relaySocketPiped   = false;
        var initialWriteCalled = false;

        var options = {
            events:      events,
            socketPaths: {https: testPath}
        };

        var server = Servers.createExternalServer(options);

        var pipe = function (s) {
            if (s === socket) {
                socketPiped = true;
            }

            if (s === relaySocket) {
                relaySocketPiped = true;
            }

            if (socketPiped && relaySocketPiped) {
                Net.connect = connect;
                assert(initialWriteCalled);
                done();
            }
        };

        socket.pipe      = pipe;
        relaySocket.pipe = pipe;

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
        var connect            = Net.connect;
        var data               = new Buffer("123");
        var events             = new Events.EventEmitter;
        var testPath           = "test-path";
        var socket             = new Events.EventEmitter;
        var relaySocket        = new Events.EventEmitter;
        var socketPiped        = false;
        var relaySocketPiped   = false;
        var initialWriteCalled = false;

        var options = {
            events:      events,
            socketPaths: {http: testPath}
        };

        var server = Servers.createExternalServer(options);

        var pipe = function (s) {
            if (s === socket) {
                socketPiped = true;
            }

            if (s === relaySocket) {
                relaySocketPiped = true;
            }

            if (socketPiped && relaySocketPiped) {
                Net.connect = connect;
                assert(initialWriteCalled);
                done();
            }
        };

        socket.pipe      = pipe;
        relaySocket.pipe = pipe;

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
        var connect       = Net.connect;
        var events        = new Events.EventEmitter;
        var socket        = new Events.EventEmitter;
        var forwardSocket = new Events.EventEmitter;
        var testError     = "test error";
        var noop          = function () {};

        var options = {
            events:      events,
            socketPaths: {tunnelConnect: "test-path"}
        };

        var server = Servers.createExternalServer(options);

        socket.pipe         = noop;
        forwardSocket.pipe  = noop;
        forwardSocket.write = noop;

        Net.connect = function (address) {
            return forwardSocket;
        };

        events.on("error", function (err, origin) {
            Net.connect = connect;

            assert(err === testError);
            assert(origin.indexOf(Servers.externalServerOrigin) === 0);

            done();
        });

        server.emit("connection", socket);
        socket.emit("data", new Buffer("123"));
        forwardSocket.emit("error", testError);
    });

    test("internal server does not use tls by default", function () {
        var createServer = Http.createServer;
        var httpServer   = new Events.EventEmitter;

        Http.createServer = function () {
            return httpServer;
        };

        var server = Servers.createInternalHttp();
        assert(server === httpServer);
        Http.createServer = createServer;
    });

    test("internal server uses tls when specified", function () {
        var createServer = Https.createServer;
        var httpsServer  = new Events.EventEmitter;

        Https.createServer = function () {
            return httpsServer;
        };

        var server = Servers.createInternalHttp({useTls: true});
        assert(server === httpsServer);
        Https.createServer = createServer;
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
        var request    = new Events.EventEmitter;

        var server = Servers.createInternalHttp({
            events: events,
            origin: testOrigin
        });

        request.rawHeaders = [];
        request.headers    = {};
        request.url        = "";

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
        var request    = new Events.EventEmitter;
        var response   = new Events.EventEmitter;

        var server = Servers.createInternalHttp({
            events: events,
            origin: testOrigin
        });

        request.rawHeaders = [];
        request.headers    = {};
        request.url        = "";

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
        var request = new Events.EventEmitter;
        var called  = false;
        var server  = Servers.createInternalHttp({events: events});

        request.rawHeaders = [];
        request.headers    = {};
        request.url        = "";

        events.on("request", function () {
            assert(request.url.indexOf("http:") === 0);
            done();
        });

        server.emit("request", request, new Events.EventEmitter);
    });

    test("internal server ensures request protocol when tls", function (done) {
        var events  = new Events.EventEmitter;
        var request = new Events.EventEmitter;
        var called  = false;

        var server = Servers.createInternalHttp({
            events:  events,
            useTls:  true,
            tlsCert: FakeCert
        });

        request.rawHeaders = [];
        request.headers    = {};
        request.url        = "";

        events.on("request", function () {
            assert(request.url.indexOf("https:") === 0);
            done();
        });

        server.emit("request", request, new Events.EventEmitter);
    });

    test("internal server forwards requests", function (done) {
        var events   = new Events.EventEmitter;
        var request  = new Events.EventEmitter;
        var response = new Events.EventEmitter;
        var called   = false;
        var server   = Servers.createInternalHttp({events:  events});

        request.rawHeaders = [];
        request.headers    = {};
        request.url        = "";

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
        var connect    = Net.connect;
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var testError  = "test error";
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.write     = noop;
        socket.end       = noop;
        tunnelData.write = noop;
        tunnelData.end   = noop;

        Net.connect = function () {
            return tunnelData;
        };

        events.on("error", function (err, origin) {
            Net.connect = connect;

            assert(err === testError);
            assert(origin.indexOf(Servers.tunnelConnectOrigin) === 0);

            done();
        });

        tunnel.emit("connect", request, socket);
        request.emit("error", testError);
    });

    test("tunnel connect forwards socket errors", function (done) {
        var connect    = Net.connect;
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var testError  = "test error";
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.write     = noop;
        socket.end       = noop;
        tunnelData.write = noop;
        tunnelData.end   = noop;

        Net.connect = function () {
            return tunnelData;
        };

        events.on("error", function (err, origin) {
            Net.connect = connect;

            assert(err === testError);
            assert(origin.indexOf(Servers.tunnelConnectOrigin) === 0);

            done();
        });

        tunnel.emit("connect", request, socket);
        socket.emit("error", testError);
    });

    test("tunnel connect forwards tunnel data errors", function (done) {
        var connect    = Net.connect;
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var testError  = "test error";
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.write     = noop;
        socket.end       = noop;
        tunnelData.write = noop;
        tunnelData.end   = noop;

        Net.connect = function () {
            return tunnelData;
        };

        events.on("error", function (err, origin) {
            Net.connect = connect;

            assert(err === testError);
            assert(origin.indexOf(Servers.tunnelConnectOrigin) === 0);

            done();
        });

        tunnel.emit("connect", request, socket);
        tunnelData.emit("error", testError);
    });

    test("tunnel connect responds connection established", function (done) {
        var connect    = Net.connect;
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.end       = noop;
        tunnelData.write = noop;
        tunnelData.end   = noop;

        Net.connect = function () {
            return tunnelData;
        };

        socket.write = function (data) {
            Net.connect = connect;

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
        var connect    = Net.connect;
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.write     = noop;
        socket.end       = noop;
        tunnelData.end   = noop;

        Net.connect = function () {
            return tunnelData;
        };

        tunnelData.write = function () {
            assert(false);
        };

        tunnel.emit("connect", request, socket);
        tunnelData.emit("end");
        socket.emit("data", new Buffer("123"));

        Net.connect = connect;
    });

    test("tunnel connect does not write on socket when it is closed", function (done) {
        var connect    = Net.connect;
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.end       = noop;
        socket.destroy   = noop;
        tunnelData.write = noop;
        tunnelData.end   = noop;

        Net.connect = function () {
            return tunnelData;
        };

        socket.write = function (data) {
            Net.connect = connect;

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
        var connect    = Net.connect;
        var data       = new Buffer("123");
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.write     = noop;
        socket.end       = noop;
        tunnelData.end   = noop;

        Net.connect = function () {
            return tunnelData;
        };

        tunnelData.write = function (d) {
            Net.connect = connect;
            assert(d === data);
            done();
        };

        tunnel.emit("connect", request, socket);
        socket.emit("data", data);
    });

    test("tunnel connect copies response data to socket", function (done) {
        var connect    = Net.connect;
        var data       = new Buffer("123");
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.end       = noop;
        tunnelData.write = noop;
        tunnelData.end   = noop;

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

            Net.connect = connect;
            assert(d === data);
            done();
        };

        tunnel.emit("connect", request, socket);
        tunnelData.emit("data", data);
    });

    test("tunnel connect closes data on socket end", function (done) {
        var connect    = Net.connect;
        var data       = new Buffer("123");
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.write     = noop;
        socket.end       = noop;
        socket.destroy   = noop;
        tunnelData.write = noop;

        Net.connect = function () {
            return tunnelData;
        };

        tunnelData.end = function () {
            Net.connect = connect;
            done();
        };

        tunnel.emit("connect", request, socket);
        socket.emit("end");
    });

    test("tunnel connect destroys socket on socket end", function (done) {
        // otherwise unable to close nodejs server

        var connect    = Net.connect;
        var data       = new Buffer("123");
        var events     = new Events.EventEmitter;
        var request    = new Events.EventEmitter;
        var tunnelData = new Events.EventEmitter;
        var socket     = new Events.EventEmitter;
        var tunnel     = Servers.createTunnelConnect({events: events});
        var noop       = function () {};

        socket.write     = noop;
        socket.end       = noop;
        tunnelData.write = noop;
        tunnelData.end   = noop;

        Net.connect = function () {
            return tunnelData;
        };

        socket.destroy = function () {
            Net.connect = connect;
            done();
        };

        tunnel.emit("connect", request, socket);
        socket.emit("end");
    });
});
