/*
 * Notes:
 * - https://drupalize.me/blog/201410/using-remote-debugger-casperjs-and-phantomjs
 * -
 */
"use strict";
var system = require('system'),
    page = require('webpage').create(),
    resources = [];

// http://stackoverflow.com/questions/30221204/how-can-i-see-the-http-status-code-from-the-request-made-by-page-open
page.onResourceReceived = function(response) {
    // check if the resource is done downloading
    if (response.stage !== "end") return;
    // apply resource filter if needed:
    if (response.headers.filter(function(header) {
            if (header.name == 'Content-Type' && header.value.indexOf('text/html') == 0) {
                return true;
            }
            return false;
        }).length > 0)
        resources.push(response);
};

page.onResourceRequested = function(requestData, request) {
    if ((/http:\/\/.+?\.css/gi).test(requestData['url']) || requestData.headers['Content-Type'] == 'text/css') {
        console.error('The url of the request is matching. Aborting: ' + requestData['url']);
        request.abort();
    }
};

// phantom.onError = function(msg, trace) {
//     var msgStack = ['PHANTOM ERROR: ' + msg];
//     if (trace && trace.length) {
//         msgStack.push('TRACE:');
//         trace.forEach(function(t) {
//             msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function + ')' : ''));
//         });
//     }
//     console.error(msgStack.join('\n'));
//     phantom.exit(1);
// };

page.open(system.args[1], function (status) {
    if (status !== 'success') {
        console.log('Unable to access network');
    } else {
        // debugger;
        if (resources[0].status >= 400) {
            console.error(system.args[1] + ' returned status ' + resources[0].status);
            var exit = 1;
        }
        else {
            console.log(page.content);
            var exit = 0;
        }
        phantom.exit(exit);
    }
});