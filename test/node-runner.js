// Runs the YUI suites of test/test.html (src) or test/test-build.html (build) in Node and writes one JUnit
// TEST-<suite>.<TestCase>.xml per test case into the output directory. Exits non-zero on any failure.
//
//   node test/node-runner.js <src|build> <output directory>
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var suite = process.argv[2];
var out = process.argv[3];
var pages = { src: 'test.html', build: 'test-build.html' };
if (!pages[suite] || !out) {
    console.error('usage: node test/node-runner.js <src|build> <output directory>');
    process.exit(2);
}
var page = path.join(__dirname, pages[suite]);

// yui's Node logger calls util.error, which Node no longer has.
require('util').error = function () {};
global.YUI = require('yui').YUI;

var scripts = fs.readFileSync(page, 'utf8').match(/<script src="[^"]+"><\/script>/g).map(function (tag) {
    return tag.slice('<script src="'.length, -'"></script>'.length);
}).filter(function (src) {
    return !/^https?:/.test(src);
});
scripts.forEach(function (src) {
    var file = path.resolve(__dirname, src);
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
});

fs.mkdirSync(out, { recursive: true });

YUI({ useSync: true }).use('test', function (Y) {
    Y.use('*', function (Y) {
        var runner = Y.Test.Runner;
        runner.on('fail', function (event) {
            console.log('FAIL ' + event.testCase.name + '.' + event.testName + ': ' + event.error.getMessage());
        });
        runner.on('complete', function (event) {
            var results = event.results;
            testCases(results).forEach(function (testCase) {
                var file = 'TEST-' + suite + '.' + testCase.name.replace(/[^A-Za-z0-9._-]/g, '_') + '.xml';
                fs.writeFileSync(path.join(out, file), Y.Test.Format.JUnitXML(testCase));
            });
            console.log(suite + ': ' + results.total + ' tests, ' + results.passed + ' passed, ' + results.failed
                + ' failed, ' + results.ignored + ' ignored');
            process.exitCode = results.failed || !results.total ? 1 : 0;
        });
        runner.run();
    });
});

function testCases(results) {
    if (results.type === 'testcase') {
        return [results];
    }
    return Object.keys(results).reduce(function (found, key) {
        var child = results[key];
        return child && typeof child === 'object' && child.type ? found.concat(testCases(child)) : found;
    }, []);
}
