# Reworse

An HTTP proxy with filtering in javascript.

## Installation

E.g:

```
npm install --global reworse
```

This will install reworse as a global command.

## Usage

### Starting the proxy

In your terminal, call:

```
reworse
```

### Startup options

#### Port:

```
--port <port>
```

Port that the proxy will listen on. Default: 9000.

#### Filters:

```
--filter filter0.js --filter filter1.js
```

Each filter listed that has to be loaded. See more below about filters.

#### Socket directory:

```
--socket-dir /path/to/directory
```

Directory where the internal socket files will be created. Default: .tmp.

#### Verbose mode:

```
--verbose
```

Enable verbose mode.

#### Tls key and certification:

```
--tls-key /path/to/key --tls-cert /path/to/cert

To be able to manipulate HTTPS requests, reworse provides its own certificate
acting as the original host. To do so, it needs an RSA certificate that the
clients need to accept. These two options should be use to set the RSA key
and the certificate. (By default, reworse uses a hard-coded, self signed,
fake certificate for test purposes!)

### Starting the proxy with one or more filters

Assuming you have a filter called `my-filter.js`, you can start reworse
like this:

```
reworse --filter my-filter
```

To start reworse with multiple filters, call:

```
reworse --filter my-filters/filter0 --filter my-filters/filter1
```

Each filter needs to be entered as an option flagged with `--filter`.
The format of the filter option must be its CommonJs path, originated
from the working directory.

### Creating a filter

A simple logging filter may look like this:

```
module.exports = function (req) {
    console.log(req.url);
};
```

A reworse filter a is a javascript module that exports a function. The
exported function will be executed on each request the proxy is
processing. The filter function will receive node.js' request and
response objects as arguments.

If a filter function returns a truthy value, that indicates to the proxy
that the filter handles the current request by sending a response, and
it won't initiate the proxy request to the real host and won't send a
response.

The third argument of the filter function indicates that a previously
applied filter already handled the current request by sending a
response.

#### Example:

In filter0.js (doesn't handle):

```
module.exports = function (req, res, handled) {
    if (handled) {
        return;
    }

    if (req.url.indexOf("filtered-url") < 0) {
        return;
    }

    console.log(req.url);
}
```

In filter1.js (handles):

```
module.exports = function (req, res) {
    if (req.url.indexOf("filtered-url") < 0) {
        return;
    }

    console.log(req.url);

    res.writeHeader(200);
    res.end();

    return true;
}
```

Note: the execution order of the filters is not guaranteed, so there
should be only zero or one filter that handles a particular request.
