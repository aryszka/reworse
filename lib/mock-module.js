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

    // creates a sandbox that can be used to mock
    // module properties.
    //
    // mocking a module property:
    // mocks.mock(module, propertyName, mock)
    // if the last argument is not provided, then
    // noop is used as a replacement.
    //
    // restoring modules:
    // mocks.teardown()
    //
    // it allows overriding mocks of the same property,
    // teardown will restore the original property.
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
