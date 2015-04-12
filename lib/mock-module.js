(function () {
    "use strict";

    var noop = function () {};

    var mock = function (safe, module, name, mock) {
        var saved            = module[name];
        var continueTeardown = safe.teardown || noop;

        module[name] = mock || noop;

        safe.teardown = function () {
            module[name] = saved;
            continueTeardown();
        };
    };

    var create = function () {
        var safe = {
            teardown: noop,

            mock: function (module, name, replace) {
                mock(safe, module, name, replace);
            }
        };

        return safe;
    };

    module.exports = {create: create};
})();
