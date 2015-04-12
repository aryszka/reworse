(function () {
    "use strict";

    var Fs   = require("fs");
    var Path = require("path");

    var mkdirIfNotExists = function (dn) {
        try {
            Fs.mkdirSync(dn);
        } catch (err) {
            if (err.code !== "EEXIST") {
                throw err;
            }
        }
    };

    // creates a directory and any parent, if it
    // doesn't exist.
    // - dir: path of the directory to be created
    var ensureDir = function (dir) {
        dir = Path.resolve(dir);

        var dn = Path.dirname(dir);
        if (dn !== "/" && dn !== ".") {
            ensureDir(dn);
        }

        mkdirIfNotExists(dir);
    };

    // removes a file if exists.
    // - fn: the name of the file
    var removeIfExists = function (fn) {
        try {
            Fs.unlinkSync(fn);
        } catch (err) {
            if (err.code !== "ENOENT") {
                throw err;
            }
        }
    };

    module.exports = {
        ensureDir:        ensureDir,
        removeIfExists:   removeIfExists
    };
})();
