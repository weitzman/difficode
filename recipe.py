import importlib
import logging
import os
import subprocess
from dataclasses import dataclass
import readability
from requests_html import AsyncHTMLSession

import tomd
from bs4 import BeautifulSoup


@dataclass
class Recipe:
    url: str
    path: str
    path_repo: str
    asession: AsyncHTMLSession
    selector: str = ''
    enabled: bool = True
    readability = False
    reason: str = ''

    async def __call__(self) -> None:
        """
        Fetch HTML, parse it, write it to target
        """

        # Setup boring variables.
        dirname = os.path.basename(os.path.dirname(self.path))
        filename = os.path.basename(self.path)
        file_no_extension = os.path.splitext(filename)[0]
        path_dirname = self.path_repo + '/' + dirname
        path_no_extension = path_dirname + '/' + file_no_extension

        if not bool(self.enabled):
            logging.info(self.path + ' is disabled.')
            return

        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:71.0) Gecko/20100101 Firefox/71.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }

        try:
            r = await self.asession.get(self.url, headers=headers)
            r.raise_for_status()
        except:
            logging.warning('Error fetching ' + self.path + '.', exc_info=True)
            return r

        # Run any specified javascript once page loads.
        path_script = self.path.replace('.json', '.js')
        if os.path.isfile(path_script):
            with open(path_script, 'r') as fp:
                script = fp.read()

            html_original = r.text
            # @todo The html before and after this call is always the same!
            try:
                await r.html.arender(keep_page=True, script=script, sleep=5, timeout=20.0, wait=5)
                # @todo Move this down
                await r.html.page.screenshot({'path': path_no_extension + '.png', 'fullPage': True})
            except:
                logging.warning('Error rendering ' + self.path + '.', exc_info=True)
                return r
            html_rendered = r.text
        html = r.text
        soup = BeautifulSoup(html, 'html.parser')
        selected = html
        if self.selector:
            if soup.select(self.selector):
                selected = str(soup.select(self.selector)[0])
            else:
                logging.warning(
                    self.selector + ' selector not found at ' + self.url)
        if self.readability:
            doc = readability.Document(html)
            selected = doc.summary(html_partial=True)

        # Run any 'clean' script e.g. https://github.com/weitzman/difficode/tree/master/recipes/facebook/cookies.py.
        try:
            cleaner = self.path.replace('.json', '').replace('/', '.')
            module = importlib.import_module(cleaner)
            selected = module.clean(selected)
        except ImportError:
            pass
        except Exception as e:
            logging.warning('Error cleaning ' + self.path + '.', exc_info=True)

        markdown = tomd.convert(selected)

        os.makedirs(path_dirname, exist_ok=True)
        path_md = path_no_extension + '.md'
        # is_new = os.path.filexists
        with open(path_md, encoding='utf-8', mode="w") as fh:
            fh.write(markdown)

        # Write a 'full' and 'selected' variants if markdown variant has changed or is new. Otherwise, too many commits.
        subprocess.run(['git', 'add', path_md], cwd=path_dirname, check=True)
        result = subprocess.run(['git', 'diff', 'HEAD', '--exit-code'], cwd=path_dirname)
        if result.returncode >= 1:
            with open(path_no_extension + '.selected.html', encoding='utf-8', mode="w") as fh:
                fh.write(str(BeautifulSoup(selected, 'html.parser').prettify()))
            with open(path_no_extension + '.html', encoding='utf-8', mode="w") as fh:
                fh.write(str(soup))
            subprocess.run(['git', 'add', '.'], cwd=path_dirname, check=True)
            msg = 'Update to ' + dirname + '/' + file_no_extension + '.'
            subprocess.run(['git', 'commit', '-m', msg], cwd=path_dirname, check=True)
