(function () {
    "use strict";

    var Errors   = require("./errors");
    var Events   = require("events");
    var FakeCert = require("./fake-cert");
    var FsEnv    = require("./fs-env");
    var Path     = require("path");
    var Servers  = require("./servers");
    var Util     = require("util");
    var Wait     = require("./wait");

    var defaultSocketDir        = ".tmp";
    var httpSocketName          = "http";
    var httpsSocketName         = "https";
    var tunnelConnectSocketName = "https-tunnel-connect";
    var fakeCertificateOrigin   = "fakecertificate";
    var httpFallbackOrigin      = "httpfallback";

    var initEnv = function (listener) {
        FsEnv.ensureDir(listener.socketDir);
        Object.keys(listener.socketPaths).map(function (key) {
            FsEnv.removeIfExists(listener.socketPaths[key]);
        });
    };

    var listenFallback = function (listener, port, clb) {
        var http = Servers.createInternalHttp({
            address: port,
            events:  listener.iface,
            origin:  httpFallbackOrigin
        });

        listener.servers = [http];
        http.listen(http.address, clb);
    };

    var listenOnAll = function (servers, clb) {
        Wait.forAll(servers.map(function (server) {
            return function (clb) {
                server.listen(server.address, clb);
            };
        }), function () {
            if (clb) {
                clb();
            }
        });
    };

    var listenFull = function (listener, port, clb) {
        if (listener.tlsCert === FakeCert) {
            Errors.emit(
                listener.iface,
                new Error("no tls certificate provided"),
                fakeCertificateOrigin
            );
        }

        var http = Servers.createInternalHttp({
            address: listener.socketPaths.http,
            events:  listener.iface,
            origin:  "internal http"
        });

        var https = Servers.createInternalHttp({
            address: listener.socketPaths.https,
            events:  listener.iface,
            origin:  "internal https",
            tlsCert: listener.tlsCert,
            useTls:  true
        });

        var tunnelConnect = Servers.createTunnelConnect({
            address:  listener.socketPaths.tunnelConnect,
            events:   listener.iface,
            dataPath: listener.socketPaths.https
        });

        var externalServer = Servers.createExternalServer({
            address:     port,
            events:      listener.iface,
            socketPaths: listener.socketPaths
        });

        listener.servers = [
            http,
            https,
            tunnelConnect,
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
            Errors.emit(
                listener.iface,
                fileErr,
                httpFallbackOrigin
            );

            listenFallback(listener, port, clb);
            return;
        }

        listenFull(listener, port, clb);
    };

    var closeAll = function (servers, clb) {
        Wait.forAll(servers.map(function (server) {
            return function (clb) {
                server.close(clb);
            };
        }), function () {
            if (clb) {
                clb();
            }
        });
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

    // options:
    // - tlsCert: {key: <pem string>, cert: <pem string>}
    //            certificate to use for tls communications
    // - socketDir: root directory path for the internal unix sockets
    var create = function (options) {
        options = options || {};

        var listener = {
            tlsCert:   options.tlsCert   || FakeCert,
            socketDir: options.socketDir || defaultSocketDir,
        };

        listener.socketPaths = {
            http:          Path.join(listener.socketDir, httpSocketName),
            https:         Path.join(listener.socketDir, httpsSocketName),
            tunnelConnect: Path.join(listener.socketDir, tunnelConnectSocketName)
        };

        listener.iface = new Interface(listener);

        return listener.iface;
    };

    module.exports = {
        createServer:            create,
        defaultSocketDir:        defaultSocketDir,
        fakeCertificateOrigin:   fakeCertificateOrigin,
        httpFallbackOrigin:      httpFallbackOrigin,
        httpSocketName:          httpSocketName,
        httpsSocketName:         httpsSocketName,
        tunnelConnectSocketName: tunnelConnectSocketName
    };
})();
