(function () {
    "use strict";

    var fakeCertificateMessage = "No TLS certificate provided, using fake certificate.";
    var httpFallbackMessage    = "Failed to initialize https tunnling, using http fallback.";

    var makeCustomHandler = function (options, predicate, handler) {
        return function (message) {
            if (!predicate(message)) {
                return false;
            }

            if (handler) {
                handler(message);
                return true;
            }

            if (options.verbose) {
                options.out(message);
            }

            return true;
        };
    };

    var staticPrint = function (options, message) {
        return function () {
            options.out(message);
        };
    };

    var defaultOut = function (message) {
        console.error(message);
    };

    var defaultHandler = function (options, message) {
        if (options.verbose) {
            defaultOut(message);
            return;
        }

        defaultOut(message.message || message);
    };

    // reason: probably, client closes secure connection.
    var isListenerConnReset = function (message) {
        return (
            message.code === "ECONNRESET" &&
            message.origin === "listener:externalserver-socket"
        );
    };

    // reason: polling by chrome of the address space with random hostname
    //         strings to detect ISP redirects.
    var isProxyIspPolling = function (message) {
        return (
            message.syscall === "getaddrinfo" &&
            message.code === "ENOTFOUND" &&
            message.hostname !== "localhost" &&
            message.hostname.indexOf(".") < 0 &&
            message.origin === "proxy:proxy-proxyrequest"
        );
    };

    // reason: cannot connect to host.
    var proxyCannotConnectToHost = function (message) {
        return (
            message.syscall === "connect" &&
            message.code === "ECONNREFUSED" &&
            message.origin === "proxy:proxy-proxyrequest"
        );
    };

    // reason: no certificate provided
    var isFakeCertificate = function (message) {
        return message.origin === "listener:fakecertificate";
    };

    // reason: failed to create unix sockets
    var isHttpFallback = function (message) {
        return message.origin === "listener:httpfallback";
    };

    var create = function (options) {
        options         = options || {};
        options.verbose = options.verbose || false;
        options.out     = options.out || defaultOut;

        var mkcustom = function (predicate, handler) {
            return makeCustomHandler(options, predicate, handler);
        };

        var mkstatic = function (message) {
            return staticPrint(options, message);
        };

        var custom = [
            mkcustom(isListenerConnReset),
            mkcustom(isProxyIspPolling),
            mkcustom(proxyCannotConnectToHost),
            mkcustom(isFakeCertificate, mkstatic(fakeCertificateMessage)),
            mkcustom(isHttpFallback, mkstatic(httpFallbackMessage))
        ];

        return function (message) {
            var handled = custom.some(function (handler) {
                return handler(message);
            });

            if (!handled) {
                options.out(message);
            }
        };
    };

    module.exports = {
        create: create,

        fakeCertificateMessage: fakeCertificateMessage,
        httpFallbackMessage:    httpFallbackMessage
    };
})();
