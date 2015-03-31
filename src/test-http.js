(function () {
    "use strict";

    var assert   = require("assert");
    var FakeCert = require("./fake-cert");
    var Http     = require("http");
    var Https    = require("https");
    var Tls      = require("tls");
    var Url      = require("url");
    var Util     = require("util");
    var Wait     = require("./wait");

    var httpPort    = 9090;
    var httpsPort   = 4545;
    var reworsePort = 9999;

    var ProxyAgent = function (options) {
        Https.Agent.call(this, options);
        this.options = options || {};
    };

    Util.inherits(ProxyAgent, Https.Agent);

    ProxyAgent.prototype.createConnection = function (options, clb) {
        var requestHost = options.host + ":" + options.port;

        var req = Http.request({
            host:    this.options.host,
            port:    this.options.port,
            method:  "connect",
            headers: {host: requestHost}
        });

        req.on("connect", function (req, socket, head) {
            var tls = Tls.connect({socket: socket}, function () {
                clb(null, tls);
            });
        });

        req.on("error", function (err) {
            clb(err);
        });

        req.end();
    };

    ProxyAgent.prototype.addRequest = function (req, options) {
        this.createSocket(req, options, function (socket) {
            req.onSocket(socket);
        });
    };

    ProxyAgent.prototype.createSocket = function (req, options, clb) {
        this.createConnection({
            host: options.host,
            port: options.port
        }, function (err, socket) {
            if (err) {
                req.emit("error", err);
                return;
            }

            socket.on("free", function () {
                this.emit("free", socket);
            }.bind(this))

            clb(socket);
        }.bind(this));
    };

    var contentHeaders = function (chunks, headers) {
        var contentHeaders = {
            "Content-Length": String(Buffer.concat(chunks).length),
            "Content-Type":   "text/plain"
        };

        if (headers) {
            for (var header in headers) {
                contentHeaders[header] = headers[header];
            }
        }

        return contentHeaders;
    };

    var send = function (message, dataChunks, clb) {
        dataChunks = dataChunks || [];
        clb = clb || function () {};

        var chunkSends = dataChunks.map(function (chunk) {
            return function (clb) {
                setTimeout(function () {
                    message.write(chunk);
                    clb();
                });
            };
        });

        var done = function () {
            setTimeout(function () {
                message.end();
                clb();
            });
        };

        Wait.serial(chunkSends.concat(done));
    };

    var sendResponse = function (res, headers, dataChunks, clb) {
        headers = contentHeaders(dataChunks, headers);
        res.writeHead(200, headers);
        send(res, dataChunks, clb);
    };

    var testServer = function (options, clb) {
        options = options || {};
        clb = clb || function () {};

        options.port = options.port || (options.useTls ? httpsPort : httpPort);

        var server = options.useTls ?
            Https.createServer(FakeCert) :
            Http.createServer();

        server.on("request", function (req, res) {
            var receivedData = [];

            req.on("data", function (data) {
                receivedData.push(data);
            });

            req.on("end", function () {
                server.emit("requestcomplete", req, res, Buffer.concat(receivedData));
                if (!options.autoResponseDisabled) {
                    sendResponse(res, options.headers, options.dataChunks || receivedData);
                }
            });
        });

        server.listen(options.port, function () {
            clb(server);
        });

        return server;
    };

    var testRequest = function (options) {
        options = options || {};

        options.method   = options.method || "GET";
        options.hostname = options.hostname || "localhost";
        options.port     = options.port || reworsePort;
        options.headers  = options.headers || {};
        options.useTls   = options.useTls || options.tunneling;

        options.headers["Accept"] = options.headers["Accept"] || "*/*";

        options.headers["Host"] = options.headers["Host"] ||
            ("localhost:" + (options.useTls ? httpsPort : httpPort));

        var Implementation = options.useTls ? Https : Http;

        var agentOptions = function () {
            var agentOptions = {};

            if (options.keepAlive) {
                agentOptions.keepAlive      = true;
                agentOptions.maxSockets     = 1;
                agentOptions.maxFreeSockets = 1;
            }

            if (options.tunneling) {
                agentOptions.host = options.hostname;
                agentOptions.port = options.port;
            }

            return agentOptions;
        };

        var agentType = function () {
            return options.tunneling ? ProxyAgent : Implementation.Agent;
        };

        if (options.keepAlive || options.tunneling) {
            var Agent = agentType();
            options.agent = new Agent(agentOptions());
        }

        var req = Implementation.request(options);

        req.on("response", function (res) {
            var receivedData = [];
            res.on("data", receivedData.push.bind(receivedData));
            res.on("end", function () {
                req.emit("responsecomplete", res, Buffer.concat(receivedData));
            });
        });

        return req;
    };

    var assertHeaders = function (message, headers, ignore) {
        ignore = ignore || [];
        assert(Object.keys(headers).every(function (header) {
            return (
                ignore.indexOf(header) >= 0 ||
                headers[header] === message.headers[header.toLowerCase()]
            );
        }));
    };

    var chunksToString = function (chunks) {
        return Buffer.concat(chunks).toString();
    };

    var assertData = function (chunks0, chunks1) {
        assert(chunksToString(chunks0) === chunksToString(chunks1));
    };

    var assertPath = function (url, path) {
        assert(path === Url.parse(url).path);
    };

    module.exports = {
        assertData:    assertData,
        assertHeaders: assertHeaders,
        assertPath:    assertPath,
        request:       testRequest,
        reworsePort:   reworsePort,
        send:          send,
        server:        testServer
    };
})();
