(function () {
    "use strict";

    var Flags = require("flags");
    var Fs    = require("fs");

    // loads flags to an options map:
    // --port:       options.port
    // --filter:     options.filters.pahts
    // --socket-dir: options.listener.socketDir
    // --verbose:    options.verbose
    // --tls-key:    options.listener.tlsCert.key
    // --tls-cert:   options.listener.tlsCert.cert
    var load = function (out) {
        Flags.reset();

        Flags.defineMultiString("filter", []);
        Flags.defineInteger("port");
        Flags.defineString("socket-dir");
        Flags.defineString("tls-key");
        Flags.defineString("tls-cert");
        Flags.defineBoolean("verbose");

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
