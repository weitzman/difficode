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
    - Process one recipe: `app.py load recipes/uber/privacy.json process`
    - Increase log verbosity via an env variable `DEBUGGING=1 app.py all`
    - Write output to a custom dir: `REPO_PATH=/my/path app.py all`. Defaults to `/tmp/diffidata`.
    
Recipes
=========
- A recipe is JSON file. [Example](https://github.com/weitzman/difficode/blob/master/recipes/uber/privacy.json).
    - url: The web page to fetch
    - selector: A [CSS selector](https://www.sitepoint.com/css-selectors/) so we can extract only the policy content, and not page navigation.
    - [See all properties in the Recipe class](recipe.py). 
- Ideally a recipe directory contains a [maintainers.json file](https://github.com/weitzman/difficode/blob/master/recipes/lyft/maintainers.json). A maintainer helps fix problems when the policy web page changes or moves.
- A recipe can have a accompanying Python script what does arbitrary cleanup before Markdown is extracted. [Example](https://github.com/weitzman/difficode/blob/master/recipes/facebook/cookies.py).
- Why not add more recipes by submitting a PR to this repo?
  
Misc
=========
- This app runs daily at [Heroku](https://dashboard.heroku.com/apps/difficode/).
- Make sure you have Python 3.7 or higher: `python3 --version`.