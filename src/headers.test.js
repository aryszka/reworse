suite("headers", function () {
    "use strict";

    var assert  = require("assert");
    var Headers = require("./headers");

    test("returns canonical header names", function () {
        var canonical = Headers.canonicalHeaders([
            "Some-Good-Header", "some header value 0",
            "some-Bad-Header-0", "some header value 1",
            "Some-bad-Header-1", "some header value 2",
            "some-bad-header-2", "some header value 3"
        ]);

        assert(canonical[0] === "Some-Good-Header");
        assert(canonical[1] === "some header value 0");
        canonical = canonical.slice(2);

        assert(canonical[0] === "Some-Bad-Header-0");
        assert(canonical[1] === "some header value 1");
        canonical = canonical.slice(2);

        assert(canonical[0] === "Some-Bad-Header-1");
        assert(canonical[1] === "some header value 2");
        canonical = canonical.slice(2);

        assert(canonical[0] === "Some-Bad-Header-2");
        assert(canonical[1] === "some header value 3");
    });

    test("ensures canonical headers", function () {
        var message = {
            rawHeaders: [
                "some-bad-header",
                "some header value"
            ],

            headers: {}
        };

        Headers.conditionMessage(message);
        assert(message.rawHeaders[0] === "Some-Bad-Header");
        assert(message.rawHeaders[1] === "some header value");
    });

    test("strips proxy header", function () {
        var message = {
            rawHeaders: [
                "Proxy-Connection",
                "close"
            ],

            headers: {
                "proxy-connection": "close"
            }
        };

        Headers.conditionMessage(message);
        assert(message.rawHeaders.length === 0);
        assert(!("proxy-connection" in message.rawHeaders));
    });

    test("strips proxy header", function () {
        var message = {
            rawHeaders: [
                "Strict-Transport-Security",
                "max-age=4096"
            ],

            headers: {
                "strict-transport-security": "close"
            }
        };

        Headers.conditionMessage(message);
        assert(message.rawHeaders.length === 0);
        assert(!("strict-transport-security" in message.rawHeaders));
    });

    test("converts connection header to 'close'", function () {
        var message = {
            rawHeaders: [
                "Connection",
                "keep-alive"
            ],

            headers: {
                "connection": "keep-alive"
            }
        };

        Headers.conditionMessage(message);
        assert(message.rawHeaders[0] === "Connection");
        assert(message.rawHeaders[1] === "close");
        assert(message.headers["connection"] === "close");
    });

    test("keeps headers", function () {
        var message = {
            rawHeaders: [
                "Some-Header",
                "some header value"
            ],

            headers: {
                "some-header": "some header value"
            }
        };

        Headers.conditionMessage(message);
        assert(message.rawHeaders[0] === "Some-Header");
        assert(message.rawHeaders[1] === "some header value");
        assert(message.headers["some-header"] === "some header value");
    });
});
