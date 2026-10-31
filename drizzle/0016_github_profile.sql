-- Populate the requested profile icon without overwriting a configured account.
UPDATE `site_settings` SET `github` = 'https://github.com/GGGxsb' WHERE trim(`github`) = '';
