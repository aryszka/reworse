(function () {
    "use strict";

    var Options = require("./options");
    var Reworse = require("./reworse");

    var out = function (m) {
        console.error(m);
    };

    Reworse.run(Options.load(out));
})();
