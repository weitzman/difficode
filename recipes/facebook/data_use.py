from bs4 import BeautifulSoup


def clean(selected: str) -> str:
    """
    Remove href for FB shim links.
    https://www.facebook.com/notes/facebook-security/link-shim-protecting-the-people-who-use-facebook-from-malicious-urls/10150492832835766
    """
    soup = BeautifulSoup(selected, 'html.parser')
    links = soup.select('a[data-lynx-mode="asynclazy"]', href=True)
    links2 = soup.select('a[data-lynx-mode="async"]', href=True)
    for link in links + links2:
        link['href'] = ''
    return str(soup)
