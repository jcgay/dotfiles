# dotfiles

My OS X configuration.   
Greatly inspired by [https://github.com/holman/dotfiles](https://github.com/holman/dotfiles)

## Installation

```
git clone https://github.com/jcgay/dotfiles.git ~/.dotfiles
cd ~/.dotfiles
script/bootstrap.sh
script/install.sh
```

## Manual post installation steps 😇

 - Setup the Dropbox sync with the client application
 - Run  `mackup restore`
 - Restore gpg and ssh keys
 - Install [Prey](http://preyproject.com/): `HOMEBREW_NO_ENV_FILTERING=1 API_KEY="abcdef123456" brew cask install prey`

## Description

There's a few special files in the hierarchy.

- **bin/**: Anything in `bin/` will get added to your `$PATH` and be made
  available everywhere.
- **topic/\*.zsh**: Any files ending in `.zsh` get loaded into your
  environment.
- **topic/path.zsh**: Any file named `path.zsh` is loaded first and is
  expected to setup `$PATH` or similar.
- **topic/completion.zsh**: Any file named `completion.zsh` is loaded
  last and is expected to setup autocomplete.
- **topic/\*.symlink**: Any files ending in `*.symlink` get symlinked into
  your `$HOME`. This is so you can keep all of those versioned in your dotfiles
  but still keep those autoloaded files in your home directory. These get
  symlinked in when you run `script/bootstrap`.

## Testing

You will need [`vagrant`](https://www.vagrantup.com) to manage the environment.

    vagrant up
