(function () {
    "use strict";

    var Cert   = require("./cert");
    var Events = require("events");
    var Fs     = require("fs");
    var Http   = require("http");
    var Https  = require("https");
    var Net    = require("net");
    var Path   = require("path");
    var Util   = require("util");

    var defaultSocketDir = ".tmp";
    var httpSocketName   = "http";
    var httpsSocketName  = "https";

    var mkdirIfNoExist = function (dn) {
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

        mkdirIfNoExist(dir);
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
            http:  Path.join(socketDir, httpSocketName),
            https: Path.join(socketDir, httpsSocketName)
        };

        ensureDir(socketDir);
        removeIfExists(socketPaths.http);
        removeIfExists(socketPaths.https);

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

    var copyRequestEvent = function (source, proxy) {
        if (source) {
            copyEvent(source, proxy, "request");
        }
    };

    var httpFallback = function (server, port, clb) {
        server.http = Http.createServer();
        copyRequestEvent(server.http, server.proxy);
        server.http.listen(port, clb);
    };

    var isClientHello = function (data) {
        return data[0] === 22;
    };

    var copySocket = function (server, socket, initialData) {
        var unixSocket = Net.connect(
            isClientHello(initialData) ?
                server.socketPaths.https :
                server.socketPaths.http
        );

        unixSocket.write(initialData);
        socket.pipe(unixSocket);
        unixSocket.pipe(socket);
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
    };

    var createAllServers = function (server) {
        server.net = Net.createServer();
        server.http = Http.createServer();
        createHttpsServer(server);
    };

    var listenOnAll = function (server, port, clb) {
        createAllServers(server);
        copyRequestEvent(server.http, server.proxy);
        copyRequestEvent(server.https, server.proxy);

        server.net.on("connection", function (socket) {
            socket.once("data", function (data) {
                copySocket(server, socket, data);
            });
        });

        server.http.listen(server.socketPaths.http);
        server.https.listen(server.socketPaths.https);
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
            server.https
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
