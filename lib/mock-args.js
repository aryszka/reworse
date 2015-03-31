(function () {
    "use strict";

    var mockArgs = function (args, test) {
        args = args || [];

        process.argv = process.argv
            .slice(0, 2)
            .concat(args);

        if (test) {
            test();
        }
    };

    module.exports = mockArgs;
})();
