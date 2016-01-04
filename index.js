#!/usr/bin/env node
var request = require("sync-request"),
    cheerio = require("cheerio"),
    path = require("path"),
    exec = require('child_process').execSync,
    fs = require('fs'),
    mkdirp = require("mkdirp");

const REPO_URL = 'https://' + process.env.DIFFI_USER + ':' + process.env.DIFFI_PASS + '@github.com/weitzman/diffi.git';
const REPO_PATH = '/tmp/diffidata';

init();
cook();

function cook() {
  var recipes_path = __dirname + '/recipes';
  walk(recipes_path).forEach(function (item) {
    var contents = fs.readFileSync(item);
    var jsonContent = JSON.parse(contents);
    if (jsonContent.enabled != 1) { return; }

    try {
      var options = {
        // Facebook (and possibly others) require a real browser.
        headers: {'User-Agent': 'Mozilla/5.0 (iPad; U; CPU OS 3_2_1 like Mac OS X; en-us) AppleWebKit/531.21.10 (KHTML, like Gecko) Mobile/7B405'},
        qs: {'u': jsonContent.url},
        retry: true
      };
      var res = request('GET', jsonContent.url, options);
      try {
        var body = res.body.toString();
        var target_base = find_target(item);
        var target_base_dir = path.dirname(target_base);
        mkdirp.sync(target_base_dir);

        // Get selection variant.
        var $ = cheerio.load(body);
        var selected = $(jsonContent.selector).html();
        if (selected) {
          fs.writeFileSync(target_base + '.selected.html', selected); // {"encoding": "utf8"}
        }

        // Get Markdown variant.
        var res2 = request('GET', 'http://fuckyeahmarkdown.com/go/', {qs: {'u': jsonContent.url}});
        var body2 = res2.body.toString();
        fs.writeFileSync(target_base + '.md', body2);

        // Add any changes to git index.
        exec('git add .', {cwd: target_base_dir});

        // Write a 'full' variant if either above variant has changed. Otherwise, too many commits.
        var output = exec('git diff-index --quiet HEAD', {cwd: target_base_dir});
        if (output.length > 0) {
          fs.writeFileSync(target_base + '.html', body);
          exec('git add .', {cwd: target_base_dir});
        }

        var msg = 'Update to ' +  target_base_dir + '.';
        exec('git diff-index --quiet HEAD || git commit -m "' + msg + '"', {cwd: target_base_dir});
      }
      catch(ex) {
        console.log(ex);
      }
    }
    catch(ex) {
      console.log(ex);
    }
    exec('cd ' + REPO_PATH + ' && git push');
  });
}

function init() {
  exec('rm -rf ' + REPO_PATH);
  // @todo Use shallow clone with git 1.9? https://blog.oio.de/2014/02/06/better-support-for-shallow-clones-in-git-1-9/
  exec('git clone ' + REPO_URL + ' ' + REPO_PATH);
  exec('git config user.email "diffibot@diffi.com"', {cwd: REPO_PATH});
  exec('git config user.name "Diffi Bot"', {cwd: REPO_PATH});
  exec('git config push.default simple', {cwd: REPO_PATH});
}

function find_target(recipe_path) {
  target_file = path.basename(recipe_path, '.json');
  target_directory = REPO_PATH + '/' + path.basename(path.dirname(recipe_path));
  return target_directory + '/' + target_file;
}

function walk(dir) {
  var results = [];
  var list = fs.readdirSync(dir);
  list.forEach(function(file) {
    var full_path = dir + '/' + file;
    var stat = fs.statSync(full_path);
    if (stat && stat.isDirectory()) results = results.concat(walk(full_path));
    else {
      if (file != '.DS_Store') {
        results.push(full_path);
      }
    }
  });
  return results;
}
