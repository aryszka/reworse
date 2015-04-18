suite("headers", function () {
    "use strict";

    var assert  = require("assert");
    var Headers = require("./headers");

    test("returns canonical header names", function () {
        var canonical = Headers.canonical([
            "Some-Good-Header",  "some header value 0",
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

    test("maps raw headers verbatim", function () {
        var mapped = Headers.mapRaw([
            "Some-Header-0", "some value 0",
            "Some-Header-1", "some value 1"
        ]);

        assert(mapped["Some-Header-0"] === "some value 0");
        assert(mapped["Some-Header-1"] === "some value 1");

        var count = 0;
        for (var header in mapped) {
            count++;
            // assert(count <= 2);
        }
    });

    test("converts mapped headers into raw", function () {
        var raw = Headers.toRaw({
            "Some-Header-0": "some value 0",
            "Some-Header-1": "some value 1"
        });

        assert(raw[0] === "Some-Header-0");
        assert(raw[1] === "some value 0");
        assert(raw[2] === "Some-Header-1");
        assert(raw[3] === "some value 1");
        assert(raw.length === 4);
    });

    test("returns empty headers when no headers to merge", function () {
        var headers = Headers.merge();
        assert(headers.length === 0);
    });

    test("returns single headers when only one passed in", function () {
        var headers     = ["Test-Header", "Test-Value"];
        var headersBack = Headers.merge(headers);

        assert(headersBack.length === 2);
        assert(headersBack[0] === headers[0]);
        assert(headersBack[1] === headers[1]);
    });

    test("merges headers", function () {
        var first = [
            "Test-Header-0", "test value 00",
            "Test-Header-1", "test value 10",
            "Test-Header-2", "test value 20"
        ];

        var second = [
            "Test-Header-1", "test value 11",
            "Test-Header-2", "test value 21"
        ];

        var third = [
            "Test-Header-2", "test value 22"
        ];

        var headers = Headers.merge(first, second, third);
        assert(headers[0] === first[0]);
        assert(headers[1] === first[1]);
        assert(headers[2] === second[0]);
        assert(headers[3] === second[1]);
        assert(headers[4] === third[0]);
        assert(headers[5] === third[1]);
    });
});
