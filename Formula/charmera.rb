class Charmera < Formula
  desc "AI photo organizer for keychain cameras - label, rename, and enhance photos locally"
  homepage "https://h3qing.github.io/Kodak-Charmera-Companion/"
  url "https://github.com/h3qing/Kodak-Charmera-Companion.git",
      tag:      "v0.6.0",
      revision: "dd06fc8924926d517facfc69719f577dd552d63b"
  license "MIT"
  head "https://github.com/h3qing/Kodak-Charmera-Companion.git", branch: "main"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "crates/charmera-cli")
  end

  test do
    assert_match "charmera", shell_output("#{bin}/charmera --version")
  end
end
