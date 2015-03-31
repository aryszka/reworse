suite("fs-env", function () {
    "use strict";

    var assert = require("assert");
    var Fs     = require("fs");
    var FsEnv  = require("./fs-env");
    var Path   = require("path");

    var mkdir;
    var unlink;

    setup(function () {
        mkdir = Fs.mkdirSync;
        unlink = Fs.unlinkSync;
    });

    teardown(function () {
        Fs.mkdirSync = mkdir;
        Fs.unlinkSync = unlink;
    });

    test("ensures directory path", function () {
        var dirs = [];
        Fs.mkdirSync = function (dn) {
            dirs.push(dn);
        };

        FsEnv.ensureDir("/some/directory/path");
        assert(dirs[0] === "/some");
        assert(dirs[1] === "/some/directory");
        assert(dirs[2] === "/some/directory/path");
    });

    test("ensures directory path with existing dirs", function () {
        var dirs = [];
        Fs.mkdirSync = function (dn) {
            if (dn === "/some") {
                var err = new Error();
                err.code = "EEXIST";
                throw err;
            }

            dirs.push(dn);
        };

        FsEnv.ensureDir("/some/directory/path");
        assert(dirs[0] === "/some/directory");
        assert(dirs[1] === "/some/directory/path");
    });

    test("rethrows non eexist errors", function () {
        Fs.mkdirSync = function (dn) {
            throw "test error";
        };

        try {
            FsEnv.ensureDir("/some/directory/path");
            assert(false);
        } catch (err) {
            assert(err === "test error");
        }
    });

    test("resolves dir path to absolute path", function () {
        var dirs = [];
        Fs.mkdirSync = function (dn) {
            dirs.push(dn);
        };

        FsEnv.ensureDir("some-dir-path");
        assert(dirs[dirs.length - 1] === Path.resolve("some-dir-path"));
    });

    test("removes file if exists", function () {
        var removed;
        Fs.unlinkSync = function (fn) {
            removed = fn;
        };

        FsEnv.removeIfExists("test-file");
        assert(removed === "test-file");
    });

    test("tries to remove not existing file", function () {
        var tried;
        Fs.unlinkSync = function (fn) {
            tried = fn;
            var err = new Error();
            err.code = "ENOENT";
            throw err;
        };

        FsEnv.removeIfExists("test-file");
        assert(tried === "test-file");
    });

    test("rethrows non enoent errors", function () {
        Fs.unlinkSync = function (fn) {
            throw "test error";
        };

        try {
            FsEnv.removeIfExists("test-file");
            assert(false);
        } catch (err) {
            assert(err === "test error");
        }
    });
});
