// needs to be cleaned up, based on:
// https://gist.github.com/matthias-christen/6beb3b4dda26bd6a221d

var Util = require("util");
var Http = require("http");
var Https = require("https");
var Tls = require("tls");

var ProxyAgent = function (options) {
    Https.Agent.call(this, options);
    this.options = options || {};
};

Util.inherits(ProxyAgent, Https.Agent);

ProxyAgent.prototype.createConnection = function (requestOptions, clb) {
    var requestHost = requestOptions.host + ":" + requestOptions.port;

    var req = Http.request({
        host: this.options.host,
        port: this.options.port,
        method: "connect",
        path: requestHost,
        headers: {host: requestHost}
    });

    var tls;

    req.on("connect", function (req, socket, head) {
        tls = Tls.connect({socket: socket}, function () {
            clb(null, tls);
        });
    }.bind(this));

    req.on("error", function (err) {
        clb(err);
    });

    req.end();
};

ProxyAgent.prototype.addRequest = function (req, options) {
    this.createSocket(req, options, function (socket) {
        req.onSocket(socket);
    });
};

ProxyAgent.prototype.createSocket = function (req, options, clb) {
    this.createConnection({
        host: options.host,
        port: options.port
    }, function (err, socket) {
        if (err) {
            req.emit("error", err);
            return;
        }

        socket.on("free", function () {
            this.emit("free", socket);
        }.bind(this))

        clb(socket);
    }.bind(this));
};

module.exports = ProxyAgent;
