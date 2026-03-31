class Charmera < Formula
  desc "AI photo organizer for keychain cameras - label, rename, and enhance photos locally"
  homepage "https://h3qing.github.io/Kodak-Charmera-Companion/"
  url "https://github.com/h3qing/Kodak-Charmera-Companion.git",
      tag:      "v0.3.2",
      revision: "a2386b6374ee07005881a4e7aa3859386e960c37"
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
