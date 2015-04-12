(function () {
    "use strict";

    var Flags   = require("flags");
    var Fs      = require("fs");
    var Reworse = require("./reworse");

    Flags.defineMultiString("filter", []);
    Flags.defineInteger("port");
    Flags.defineString("socket-dir");
    Flags.defineString("tls-key");
    Flags.defineString("tls-cert");

    Flags.parse();

    var options = {
        port:     Flags.get("port"),
        filters:  {paths: Flags.get("filter")},
        listener: {socketDir: Flags.get("socket-dir")}
    };

    if (Flags.get("tls-cert")) {
        try {
            options.listener.tlsCert = {
                key:  Fs.readFileSync(Flags.get("tls-key")),
                cert: Fs.readFileSync(Flags.get("tls-cert"))
            };
        } catch (err) {
            console.error("failed to read tls certificate", err);
            process.exit(-1);
        }
    }

    Reworse.run(options);
})();
