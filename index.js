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
// exec('cd ' + REPO_PATH + ' && git push');

function cook() {
  var recipes_path = __dirname + '/recipes';
  walk(recipes_path).forEach(function (item) {
    var target_base = find_target(item);
    var target_base_dir = path.dirname(target_base);
    mkdirp.sync(target_base_dir);

    var contents = fs.readFileSync(item);
    var jsonContent = JSON.parse(contents);
    if (jsonContent.enabled == 0) {
      return;
    }
    try {
      var cmd = 'phantomjs --load-images=false ' + __dirname + '/fetch.js ' + jsonContent.url;
      var body = exec(cmd);
      processHtml(body.toString(), jsonContent.selector, target_base);
      processGit(body.toString(), target_base_dir, target_base);
    }
    catch (ex) {
      console.log(ex);
    }
  });
}

function processHtml(html, selector, target_base) {
  // Get selection variant.
  var $ = cheerio.load(html);
  var selected = $(selector).html();
  if (selected) {
    fs.writeFileSync(target_base + '.selected.html', selected); // {"encoding": "utf8"}

    // Get Markdown variant.
    var options = {
      method: 'POST',
      url: 'http://fuckyeahmarkdown.com/go/',
      headers: {
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: 'html=' + encodeURIComponent(selected)
    }
    var res = request('POST', 'http://fuckyeahmarkdown.com/go/', options);
    var body2 = res.getBody();
    fs.writeFileSync(target_base + '.md', body2);
  }
}

function processGit(body, target_base_dir, target_base) {
  try {
    console.log('Git: ' + target_base_dir);
    // Add any changes to git index.
    exec('git add *', {cwd: target_base_dir});

    // Write a 'full' variant if either selected or markdown variants have changed. Otherwise, too many commits.
    var output = exec('git diff-index HEAD', {cwd: target_base_dir});
    if (output.length > 0) {
      fs.writeFileSync(target_base + '.html', body);
      exec('git add .', {cwd: target_base_dir});
    }

    var msg = 'Update to ' +  target_base_dir + '.';
    var cmd = 'git diff-index --quiet HEAD || git commit -m "' + msg + '"';
    exec(cmd, {cwd: target_base_dir});
  }
  catch(ex) {
    console.log(ex);
  }
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
  var target_file = path.basename(recipe_path, '.json');
  var target_directory = REPO_PATH + '/' + path.basename(path.dirname(recipe_path));
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
