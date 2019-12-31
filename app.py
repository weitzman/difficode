#!/usr/bin/env python3

import json
import os
import subprocess
import logging
import fire
import jsons
from requests_html import AsyncHTMLSession
from recipe import Recipe

asession = AsyncHTMLSession()

"""
Fetch URLs from 'recipe' JSON files, transform them into Markdown, and save to a new repo.

Examples:
  - app.py all:
      Process all recipes.
  - app.py load recipes/user.privacy.json process
      Process one recipe.
  - DEBUGGING=1 app.py all
      Set an environment variable to see more debug messages.
  - REPO_PATH=/path/for/writing app.py all 
      Set an env variable to save files to a custom directory.

As with any Fire CLI, you can append '--' followed by any Flags to any command.
The Flags available for all Fire CLIs are:
  --help
  --interactive
  --trace
  --separator=SEPARATOR
  --completion
  --verbose
"""


def all():
    """
    Process all recipes in the /recipes directory.
    """
    __clone()
    filepaths = __get_filepaths('recipes')
    recipes = []
    for path in filepaths:
        try:
            recipe = load(path)
            recipes.append(recipe)
        # Approach from https://stackoverflow.com/a/4992124/265501
        except (KeyboardInterrupt, SystemExit):
            raise
        except Exception as e:
            # Report warning and proceed
            logging.warning('Error processing ' + path + '.', exc_info=True)
        else:
            logging.info('Successfully processed %s', path)
    results = asession.run(*recipes)
    # asession.close()
    # See https://dashboard.heroku.com/apps/difficode/settings
    if os.environ.get('DIFFI_USER') and bool(os.environ.get('ON_HEROKU', False)):
        # Avoid push if it would likely fail.
        subprocess.run(['git', 'push'], cwd=__repo_path())
    else:
        logging.warning('Skip push due to missing permissions.')


def one(path: str):
    """
    Process one recipes from the /recipes directory.
    """
    recipe = load(path)
    results = asession.run(recipe)
    # asession.close()

def load(path: str) -> Recipe:
    """
    Load one Recipe based on a .json file.
    :param path: A relative path (from repo root) to a recipe file. Example: 'recipes/apple/privacy.json'.
    """
    with open(path, 'r') as fp:
        item = json.load(fp)
        item['path'] = path
        item['path_repo'] = __repo_path()
        item['asession'] = asession
        return jsons.load(item, Recipe)


def __clone():
    """
    Clone the Diffi repo and configure git so that it can commit and push (if permitted).
    """
    subprocess.run(['rm', '-rf', __repo_path()])
    # @todo Use shallow clone with git 1.9? https://blog.oio.de/2014/02/06/better-support-for-shallow-clones-in-git-1-9/
    subprocess.run(['git', 'clone', __repo_url(), __repo_path()], check=True)
    subprocess.run(['git', 'config', 'user.email', 'diffibot@diffi.com'], cwd=__repo_path(), check=True)
    subprocess.run(['git', 'config', 'user.name', 'Diffi Bot'], cwd=__repo_path(), check=True)
    subprocess.run(['git', 'config', 'push.default', 'simple'], cwd=__repo_path(), check=True)
    # @todo Use alternate branch when developing
    # subprocess.run(['git', 'checkout', 'python'], cwd=repo_path(), check=True)


# From https://stackoverflow.com/questions/3207219/how-do-i-list-all-files-of-a-directory#3207973
def __get_filepaths(directory: str) -> list:
    """
    Generate the file names in a directory
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
            if filename != 'maintainers.json' and os.path.splitext(filename)[1] not in ['.py', '.pyc', '.js']:
                file_paths.append(filepath)

    return file_paths

def __repo_url():
    user = os.environ.get('DIFFI_USER', '')
    pw = os.environ.get('DIFFI_PASS', '')
    url = os.environ.get('DIFFI_URL', 'github.com/weitzman/diffi.git')
    return f'https://{user}:{pw}@{url}'

def __repo_path():
    return os.environ.get('REPO_PATH', '/tmp/diffidata')


if __name__ == '__main__':
    # From https://stackoverflow.com/a/29402868/265501.
    if os.getenv('DEBUGGING'):
        logging.basicConfig(level=logging.INFO)
        os.putenv('PYTHONASYNCIODEBUG', '1')

    fire.Fire()
