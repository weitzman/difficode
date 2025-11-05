Introduction
-------------
The project contains recipe files in the /recipes directory. Each recipe defines a set of rules for converting a legal agreement for a given web site into a Markdown file. Examples of legal agreements are Terms of Service or Privacy Policy. 

The goal of this project to maintain a repository of how these agreements change over time. We use Git to show us those changes. 

Each time our scripts run, they fetch and convert a recipe into Markdown and write the result to the agreements directory which gets committed to a separate Git repository. The Markdown file should be free from headers, footers, ads and all the other cruft. They should have only nice readable Markdown.

Recipes
---------------

A recipe should only have 1 selector. The job of the selector is to select the main text of the page as narrowly as possible without losing policy content. Only use rules in a recipe when the selected main content needs further cleaning.
