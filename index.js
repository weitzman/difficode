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
      var res = request('GET', jsonContent.url, {retry: true});
      try {
        var body = res.body.toString();
        target_base = find_target(item);
        target = target_base + '.html';
        mkdirp(target);
        fs.writeFileSync(target, body);

        var $ = cheerio.load(body);
        var selected = $(jsonContent.selector).html();
        if (selected) {
          fs.writeFileSync(target_base + '.selected.html', selected); // {"encoding": "utf8"}
        }
        // Get Markdown version
        var res2 = request.post('http://fuckyeahmarkdown.com/go/', {form:{html:body}, retry: true});
        var body2 = res2.body.toString();
        fs.writeFileSync(target_base + '.md', body2);

        var msg = 'Update to ' +  path.dirname(target) + '.';
        exec('git add .', {cwd: path.dirname(target)});
        exec('git diff-index --quiet HEAD || git commit -m "' + msg + '"', {cwd: path.dirname(target)});
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
    file = dir + '/' + file;
    var stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(walk(file));
    else results.push(file);
  });
  return results;
}
