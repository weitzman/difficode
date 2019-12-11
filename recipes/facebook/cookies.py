from bs4 import BeautifulSoup

def clean(selected):
    """
    Remove href for FB shim links.
    https://www.facebook.com/notes/facebook-security/link-shim-protecting-the-people-who-use-facebook-from-malicious-urls/10150492832835766
    """
    soup = BeautifulSoup(selected, 'html.parser')
    links = soup.select('a[data-lynx-mode="asynclazy"]', href=True)
    for link in links:
        link['href'] = ''
    return str(soup)
