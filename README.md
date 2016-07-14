Introduction
===========
A simple Node application which processes 'recipe' files and records their output in a separate Github repo at https://github.com/weitzman/diffi. A recipe is a small JSON file detailing the URL of an organization's Privacy policy or Terms of Service. We document changes to those files in our "data" Git repository. This provides an excellent history of changes. In addition to saving a full HTML file, we save a Markdown variant for easy browsing and change presentation.

Collaboration is welcome on this project. Please file PRs for new recipes and use the issue tracker for communication.

This app runs daily at [Heroku](https://dashboard.heroku.com/apps/difficode/).

Dependencies
=======
- Node
- [PhantomJS](http://phantomjs.org/)
