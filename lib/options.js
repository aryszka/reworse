(function () {
    "use strict";

    var Defaults = require("./defaults");
    var Flags    = require("flags");
    var Fs       = require("fs");

    // loads flags to an options map:
    // --port:       options.port
    // --filter:     options.filters.pahts
    // --socket-dir: options.listener.socketDir
    // --verbose:    options.verbose
    // --tls-key:    options.listener.tlsCert.key
    // --tls-cert:   options.listener.tlsCert.cert
    var load = function (out) {
        Flags.reset();

        Flags.defineMultiString(
            "filter",
            [],
            "each filter to be used"
        );

        Flags.defineInteger(
            "port",
            Defaults.port,
            "proxy port"
        );

        Flags.defineString(
            "tls-key",
            "",
            "certficate key to use with TLS"
        );

        Flags.defineString(
            "tls-cert",
            "",
            "certificate to use with TLS"
        );

        Flags.defineBoolean(
            "verbose",
            false,
            "enable verbose mode"
        );

        Flags.defineString(
            "socket-dir",
            Defaults.socketDir,
            "directory in which to create the internal socket files"
        );

        Flags.parse();

        var options = {
            port:     Flags.get("port"),
            filters:  {paths: Flags.get("filter")},
            listener: {socketDir: Flags.get("socket-dir")},
            verbose:  Flags.get("verbose")
        };

        if (Flags.get("tls-cert")) {
            try {
                options.listener.tlsCert = {
                    key:  Fs.readFileSync(Flags.get("tls-key")),
                    cert: Fs.readFileSync(Flags.get("tls-cert"))
                };
            } catch (err) {
                out(["failed to read tls certificate", err].join(" "));
                process.exit(-1);
            }
        }

        return options;
    };

    module.exports = {load: load};
})();
