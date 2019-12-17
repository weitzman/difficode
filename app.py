import importlib
import json
import os
from requests_html import HTMLSession
import tomd
from bs4 import BeautifulSoup
import subprocess
import logging
import fire


class Diffi(object):
    def __init__(self, repo_path='/tmp/diffidata'):
        self.repo_path = repo_path
        self.repo_url = 'https://' + os.environ['DIFFI_USER'] + ':' + os.environ[
            'DIFFI_PASS'] + '@github.com/weitzman/diffi.git'

    def all(self):
        self.clone()
        filepaths = self.get_filepaths('recipes')
        for path in filepaths:
            try:
                self.process(path)
            # Approach from https://stackoverflow.com/a/4992124/265501
            except (KeyboardInterrupt, SystemExit):
                raise
            except Exception as e:
                # Report warning and proceed
                logging.warning('Error processing ' + path + '.', exc_info=True)
            else:
                logging.info('Successfully processed %s', path)
        subprocess.run(['git', 'push'], cwd=self.repo_path)

    def clone(self):
        subprocess.run(['rm', '-rf', self.repo_path])
        # @todo Use shallow clone with git 1.9? https://blog.oio.de/2014/02/06/better-support-for-shallow-clones-in-git-1-9/
        subprocess.run(['git', 'clone', self.repo_url, self.repo_path], check=True)
        subprocess.run(['git', 'config', 'user.email', 'diffibot@diffi.com'], cwd=self.repo_path, check=True)
        subprocess.run(['git', 'config', 'user.name', 'Diffi Bot'], cwd=self.repo_path, check=True)
        subprocess.run(['git', 'config', 'push.default', 'simple'], cwd=self.repo_path, check=True)
        # @todo Use alternate branch when developing
        # subprocess.run(['git', 'checkout', 'python'], cwd=self.repo_path, check=True)

    # From https://stackoverflow.com/questions/3207219/how-do-i-list-all-files-of-a-directory#3207973
    def get_filepaths(self, directory):
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

    def process(self, path_recipe):
        """
        Fetch HTML, parse it, write it to target
        :param path_recipe:
        """
        with open(path_recipe, 'r') as fp:
            item = json.load(fp)

        # Setup boring variables.
        dirname = os.path.basename(os.path.dirname(path_recipe))
        filename = os.path.basename(path_recipe)
        file_no_extension = os.path.splitext(filename)[0]
        path_dirname = self.repo_path + '/' + dirname
        path_no_extension = path_dirname + '/' + file_no_extension

        if not bool(item.get('enabled', True)):
            logging.info(path_recipe + ' is disabled.')
            return

        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:71.0) Gecko/20100101 Firefox/71.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
        session = HTMLSession()
        r = session.get(item['url'], headers=headers)
        r.raise_for_status()
        if 'js' in item and bool(item['js']):
            html_original = r.text
            # @todo The html before and after this call is always the same!
            r.html.render()  # keep_page=True
            # Gives warning about await/async. Help wanted.
            # r.html.page.screenshot({'path': 'example.png'})
        html = r.text
        soup = BeautifulSoup(html, 'html.parser')
        selected = html
        if item['selector']:
            if soup.select(item['selector']):
                selected = str(soup.select(item['selector'])[0])
            else:
                logging.warning(
                    item['selector'] + ' selector not found at ' + item['url'])
        # Run any 'clean' script e.g. https://github.com/weitzman/difficode/tree/master/recipes/facebook/cookies.py.
        try:
            cleaner = path_recipe.replace('.json', '').replace('/', '.')
            module = importlib.import_module(cleaner)
            selected = module.clean(selected)
        except ImportError:
            pass
        except Exception as e:
            logging.warning('Error cleaning ' + path_recipe + '.', exc_info=True)

        markdown = tomd.convert(selected)

        os.makedirs(path_dirname, exist_ok=True)
        path_md = path_no_extension + '.md'
        with open(path_md, "w") as fh:
            fh.write(markdown)

        # Write a 'full' and 'selected' variants if markdown variant has changed. Otherwise, too many commits.
        subprocess.run(['git', 'add', path_md], cwd=path_dirname, check=True)
        result = subprocess.run(['git', 'diff', 'HEAD', '--exit-code'], cwd=path_dirname, capture_output=True)
        if result.returncode >= 1:
            with open(path_no_extension + '.selected.html', "w") as fh:
                fh.write(str(BeautifulSoup(selected, 'html.parser').prettify()))
            with open(path_no_extension + '.html', "w") as fh:
                fh.write(str(soup))
            subprocess.run(['git', 'add', '.'], cwd=path_dirname, check=True)
            msg = 'Update to ' + dirname + '/' + file_no_extension + '.'
            subprocess.run(['git', 'commit', '-m', msg], cwd=path_dirname, check=True)


if __name__ == '__main__':
    # From https://stackoverflow.com/a/29402868/265501.
    if os.getenv('DEBUGGING'):
        logging.basicConfig(level=logging.INFO)

    fire.Fire(Diffi)
