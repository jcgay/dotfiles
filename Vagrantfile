Vagrant.configure("2") do |config|
  config.vm.box = "ramsey/macos-catalina"

  config.vm.provider "virtualbox" do |vb|
       vb.gui = true
       vb.memory = 4096
       vb.cpus = 2
       vb.linked_clone = true
  end

  config.vm.synced_folder ".", "/Users/vagrant/.dotfiles", type: "rsync",
      rsync__exclude: ".git/",
      rsync__chown: false

  config.vm.provision "shell", inline: "chown -R vagrant /Users/vagrant/.dotfiles"
  
end
