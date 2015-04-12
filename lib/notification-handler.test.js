suite("notification handler", function () {
    "use strict";

    var assert              = require("assert");
    var NotificationHandler = require("./notification-handler");

    test("does not print listener conn reset in non-verbose mode", function () {
        var message = {
            code:   "ECONNRESET",
            origin: "listener:externalserver-socket"
        };

        var out = function () {
            assert(false);
        };

        var handler = NotificationHandler.create({
            verbose: false,
            out:     out
        });

        handler(message);
    });

    test("prints listener conn reset in verbose mode", function (done) {
        var message = {
            code:   "ECONNRESET",
            origin: "listener:externalserver-socket"
        };

        var out = function (m) {
            assert(m === message);
            done();
        };

        var handler = NotificationHandler.create({
            verbose: true,
            out:     out
        });

        handler(message);
    });

    test("does not print proxy isp polling in non-verbose mode", function () {
        var message = {
            syscall:  "getaddrinfo",
            code:     "ENOTFOUND",
            hostname: "not-a-hostname",
            origin:   "proxy:proxy-proxyrequest"
        };

        var out = function () {
            assert(false);
        };

        var handler = NotificationHandler.create({
            verbose: false,
            out:     out
        });

        handler(message);
    });

    test("prints proxy isp polling in verbose mode", function (done) {
        var message = {
            syscall:  "getaddrinfo",
            code:     "ENOTFOUND",
            hostname: "not-a-hostname",
            origin:   "proxy:proxy-proxyrequest"
        };

        var out = function (m) {
            assert(m === message);
            done();
        };

        var handler = NotificationHandler.create({
            verbose: true,
            out:     out
        });

        handler(message);
    });

    test("does not print connect failed in non-verbose mode", function () {
        var message = {
            syscall: "connect",
            code:    "ECONNREFUSED",
            origin:  "proxy:proxy-proxyrequest"
        };

        var out = function () {
            assert(false);
        };

        var handler = NotificationHandler.create({
            verbose: false,
            out:     out
        });

        handler(message);
    });

    test("prints connect failed in verbose mode", function (done) {
        var message = {
            syscall: "connect",
            code:    "ECONNREFUSED",
            origin:  "proxy:proxy-proxyrequest"
        };

        var out = function (m) {
            assert(m === message);
            done();
        };

        var handler = NotificationHandler.create({
            verbose: true,
            out:     out
        });

        handler(message);
    });

    test("prints static message on fake certificate", function (done) {
        var out = function (m) {
            assert(m === NotificationHandler.fakeCertificateMessage);
            done();
        };

        var handler = NotificationHandler.create({out: out});
        handler({origin: "listener:fakecertificate"});
    });

    test("prints static message on http fallback", function (done) {
        var out = function (m) {
            assert(m === NotificationHandler.httpFallbackMessage);
            done();
        };

        var handler = NotificationHandler.create({out: out});
        handler({origin: "listener:httpfallback"});
    });

    test("prints generic messages", function (done) {
        var message = "test message";

        var out = function (m) {
            assert(m === message);
            done();
        };

        var handler = NotificationHandler.create({out: out});
        handler(message);
    });

    test("falls back to console", function (done) {
        var message = "test message";
        var stderr  = console.error;

        console.error = function (m) {
            console.error = stderr;
            assert(m === message);
            done();
        };

        var handler = NotificationHandler.create();
        handler(message);
    });
});
