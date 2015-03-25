(function () {
    "use strict";

    var Errors   = require("./default-error-handler");
    var Events   = require("events");
    var FakeCert = require("./fake-cert");
    var FsEnv    = require("./fs-env");
    var Path     = require("path");
    var Servers  = require("./servers");
    var Util     = require("util");

    var defaultSocketDir        = ".tmp";
    var httpSocketName          = "http";
    var httpsSocketName         = "https";
    var tunnelConnectSocketName = "https-tunnel-connect";
    var tunnelDataSocketName    = "https-tunnel-data";

    var waitForAll = function (clb, calls) {
        var counter = 0;
        var clbi = function () {
            counter--;
            if (!counter) {
                clb();
            }
        };

        calls.forEach(function (call) {
            counter++;
            call(clbi);
        });
    };

    var initEnv = function (listener) {
        FsEnv.ensureDir(listener.socketDir);
        Object.keys(listener.socketPaths).forEach(function (key) {
            FsEnv.removeIfExists(listener.socketPaths[key]);
        });
    };

    var listenFallback = function (listener, port, clb) {
        var http = Servers.createInternalHttp({
            address:     port,
            errorOrigin: "http fallback",
            events:      listener.iface
        });
        http.listen(http.address, clb);
        listener.servers = [http];
    };

    var listenOnAll = function (servers, clb) {
        waitForAll(clb, servers.map(function (server) {
            return function (clb) {
                server.listen(server.address, clb);
            };
        }));
    };

    var listenFull = function (listener, port, clb) {
        if (listener.tlsCert === FakeCert) {
            Errors.emit(
                "fakecertificate",
                "no tls certificate provided",
                listener.iface
            );
        }

        var http = Servers.createInternalHttp({
            address:     listener.socketPaths.http,
            errorOrigin: "internal http",
            events:      listener.iface
        });

        var https = Servers.createInternalHttp({
            address:     listener.socketPaths.https,
            errorOrigin: "internal https",
            events:      listener.iface,
            tlsCert:     listener.tlsCert,
            useTls:      true
        });

        var tunnelData = Servers.createInternalHttp({
            address:     listener.socketPaths.tunnelData,
            errorOrigin: "tunnel data",
            events:      listener.iface,
            tlsCert:     listener.tlsCert,
            useTls:      true
        });

        var tunnelConnect = Servers.createTunnelConnect({
            address:  listener.socketPaths.tunnelConnect,
            errors:   listener.iface,
            dataPath: listener.socketPaths.tunnelData
        });

        var externalServer = Servers.createExternalServer({
            address:     port,
            errors:      listener.iface,
            socketPaths: listener.socketPaths
        });

        listener.servers = [
            http,
            https,
            tunnelConnect,
            tunnelData,
            externalServer
        ];

        listenOnAll(listener.servers, clb);
    };

    var listen = function (listener, port, clb) {
        var fileErr;
        try {
            initEnv(listener);
        } catch (err) {
            fileErr = err;
        }

        if (fileErr) {
            Errors.emit("httpfallback", fileErr, listener.iface);
            listenFallback(listener, port, clb);
            return;
        }

        listenFull(listener, port, clb);
    };

    var closeAll = function (servers, clb) {
        waitForAll(clb, servers.map(function (server) {
            return function (clb) {
                server.close(clb);
            };
        }));
    };

    var close = function (listener, clb) {
        if (listener.servers) {
            closeAll(listener.servers, clb);
        }
    };

    var Interface = function (listener) {
        Events.EventEmitter.call(this);

        this.listen = function (port, clb) {
            listen(listener, port, clb);
        };

        this.close = function (clb) {
            close(listener, clb);
        };
    };

    Util.inherits(Interface, Events.EventEmitter);

    var create = function (options) {
        options = options || {};
        var listener = {
            tlsCert:   options.tlsCert || FakeCert,
            socketDir: options.socketDir || defaultSocketDir,
        };

        listener.socketPaths = {
            http:          Path.join(listener.socketDir, httpSocketName),
            https:         Path.join(listener.socketDir, httpsSocketName),
            tunnelConnect: Path.join(listener.socketDir, tunnelConnectSocketName),
            tunnelData:    Path.join(listener.socketDir, tunnelDataSocketName)
        };

        listener.iface = new Interface(listener);
        return listener.iface;
    };

    exports.createServer = create;
})();
