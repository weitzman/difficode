import importlib
import json
import os
from requests_html import HTMLSession
import tomd
from bs4 import BeautifulSoup
import subprocess
import logging

REPO_URL = 'https://' + os.environ['DIFFI_USER'] + ':' + os.environ['DIFFI_PASS'] + '@github.com/weitzman/diffi.git'
REPO_PATH = '/tmp/diffidata'
session = HTMLSession()


def init():
    subprocess.run(['rm', '-rf', REPO_PATH])
    # @todo Use shallow clone with git 1.9? https://blog.oio.de/2014/02/06/better-support-for-shallow-clones-in-git-1-9/
    subprocess.run(['git', 'clone', REPO_URL, REPO_PATH], check=True)
    subprocess.run(['git', 'config', 'user.email', 'diffibot@diffi.com'], cwd=REPO_PATH, check=True)
    subprocess.run(['git', 'config', 'user.name', 'Diffi Bot'], cwd=REPO_PATH, check=True)
    subprocess.run(['git', 'config', 'push.default', 'simple'], cwd=REPO_PATH, check=True)
    # @todo Use alternate branch when developing
    # subprocess.run(['git', 'checkout', 'python'], cwd=REPO_PATH, check=True)


# From https://stackoverflow.com/questions/3207219/how-do-i-list-all-files-of-a-directory#3207973
def get_filepaths(directory):
    """
    This function will generate the file names in a directory
    tree by walking the tree either top-down or bottom-up. For each
    directory in the tree rooted at directory top (including top itself),
    it yields a 3-tuple (dirpath, dirnames, filenames).
    """
    file_paths = []  # List which will store all of the full filepaths.

    # Walk the tree.
    for root, directories, files in os.walk(directory):
        for filename in files:
            # Join the two strings in order to form the full filepath.
            filepath = os.path.join(root, filename)
            if filename != 'maintainers.json' and os.path.splitext(filename)[1] not in ['.py', '.pyc']:
                file_paths.append(filepath)

    return file_paths


def get_jsons(paths):
    """
    Read JSON files into a list
    :param paths:
    """
    data = []  # List which will store dicts made from json files.

    for path in paths:
        with open(path, 'r') as fp:
            obj = json.load(fp)
            obj['recipe_full'] = path
            obj['dirname'] = os.path.basename(os.path.dirname(path))
            data.append(obj)

    return data


def process(item):
    """
    Fetch HTML, parse it, write it to target
    :param item:
    """
    if not bool(item.get('enabled', True)):
        logging.info(item['recipe_full'] + ' is disabled.')
        return

    try:
        # Setup boring variables.
        filename = os.path.basename(item['recipe_full'])
        path_dirname = REPO_PATH + '/' + item['dirname']
        path_no_extension = path_dirname + '/' + os.path.splitext(filename)[0]

        # Make request using Request package. Catch exception on any error.
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:71.0) Gecko/20100101 Firefox/71.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
        r = session.get(item['url'], headers=headers)
        r.raise_for_status()

        if 'js' in item and bool(item['js']):
            r.html.render() # keep_page=True
            # Gives warning about await/async. Help wanted.
            # r.html.page.screenshot({'path': 'example.png'})

        html = r.text
        soup = BeautifulSoup(html, 'html.parser')
        selected = html
        if item['selector']:
            if soup.select(item['selector']):
                selected = str(soup.select(item['selector'])[0])
            else:
                logging.warning(item['selector'] + ' selector not found at ' + item['url'] + ' for ' + item['recipe_full'])

        # Run any 'clean' script (e.g. https://github.com/weitzman/difficode/tree/master/recipes/facebook/cookies.py)
        try:
            cleaner = item['recipe_full'].replace('.json', '').replace('/', '.')
            module = importlib.import_module(cleaner)
            selected = module.clean(selected)
        except ImportError:
            pass
        except Exception as e:
            logging.warning('Error cleaning ' + item['recipe_full'] + '.', exc_info=True)

        markdown = tomd.convert(selected)
        with open(path_no_extension + '.md', "w") as fh:
            fh.write(markdown)
        # Write a 'full' and 'selected' variants if markdown variant has changed. Otherwise, too many commits.
        result = subprocess.run(['git', 'diff', 'HEAD', '--exit-code'], cwd=path_dirname, capture_output=True)
        if result.returncode >= 1:
            with open(path_no_extension + '.selected.html', "w") as fh:
                fh.write(selected)
            with open(path_no_extension + '.html', "w") as fh:
                fh.write(str(soup))
            subprocess.run(['git', 'add', '.'], cwd=path_dirname, check=True)
            msg = 'Update to ' + item['dirname'] + '.'
            subprocess.run(['git', 'commit', '-m', msg], cwd=path_dirname, check=True)
    # Approach from https://stackoverflow.com/a/4992124/265501
    except (KeyboardInterrupt, SystemExit):
        raise
    except Exception as e:
        # Report warning and proceed
        logging.warning('Error processing ' + item['recipe_full'] + '.', exc_info=True)
    else:
        logging.info('Successfully processed %s', item['recipe_full'])


init()
filepaths = get_filepaths('recipes')
data = get_jsons(filepaths)
for item in data:
    process(item)
subprocess.run(['git', 'push'], cwd=REPO_PATH)
