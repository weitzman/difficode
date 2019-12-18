Introduction
===========
A simple Python application which processes 'recipe' files and records their output in a separate Github repo at https://github.com/weitzman/diffi. A recipe is a small JSON file detailing the URL of an organization's Privacy policy or Terms of Service. We record changes to those files in our "data" Git repository. This provides an excellent history of changes. In addition to saving a full HTML file, we save a Markdown variant for easy browsing and change presentation.

Development
============
Collaboration is welcome on this project. Please file PRs for new/updated recipes and use the issue tracker for communication.

To get started:

1. Clone this repo: `git clone https://github.com/weitzman/difficode.git`
1. Change into new dir: `cd difficode`
1. Get dependencies: `pip install -r requirements.txt`
1. Some commands you may want to run
    - Process all recipes: `app.py all`
    - Process one recipe: `app.py process recipes/uber/privacy.json`
    - Increase log verbosity via an env variable `DEBUGGING=1 app.py all`
  
Misc
=========
- Processed files are stored at /tmp/diffidata by default. Customize via `--repo_path=/path/to/dir`
- This app runs daily at [Heroku](https://dashboard.heroku.com/apps/difficode/).
- Python 3 is expected.