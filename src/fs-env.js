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

    var ensureDir = function (dir) {
        dir = Path.resolve(dir);

        var dn = Path.dirname(dir);
        if (dn !== "/" && dn !== ".") {
            ensureDir(dn);
        }

        mkdirIfNotExists(dir);
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

    module.exports = {
        ensureDir:        ensureDir,
        removeIfExists:   removeIfExists
    };
})();
