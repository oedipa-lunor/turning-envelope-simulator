# T字路 旋回シミュレーター

T字路で車両が曲がれるかを確認する静的Webアプリです。

車両寸法、道路幅、最小回転半径、余裕幅を指定し、開始可能領域と車体・タイヤ軌跡・車体四隅の軌跡を表示します。

## 公開構成

公開に必要なファイルは `public/` 配下にまとまっています。

```text
public/
  index.html
  app.js
  style.css
  data/vehicle_presets.json
  libs/geometry.js
```

GitHub Pages へは `.github/workflows/pages.yml` の GitHub Actions ワークフローで `public/` をデプロイします。

## GitHub Pages で公開する

1. このフォルダをGitHubリポジトリに push します。
2. GitHub のリポジトリ画面で `Settings` を開きます。
3. `Pages` を開きます。
4. `Build and deployment` の `Source` で `GitHub Actions` を選びます。
5. `Actions` タブで `Deploy GitHub Pages` が成功するのを待ちます。
6. Pages のURLを開きます。

想定URL:

```text
https://oedipa-lunor.github.io/turning-envelope-simulator/
```

## ローカルで使う

Windows では `start.bat` をダブルクリックしてください。

自動でローカルサーバーを起動し、ブラウザで以下を開きます。

```text
http://127.0.0.1:4173/
```

終了するときは、起動した `turning-envelope-simulator server` のウィンドウを閉じてください。

## 動かない場合

Node.js が必要です。入っていない場合は以下から LTS 版をインストールしてください。

```text
https://nodejs.org/
```

インストール後、もう一度 `start.bat` をダブルクリックしてください。

## 手動起動

コマンドで起動する場合:

```powershell
node dev-server.js
```

ブラウザで `http://127.0.0.1:4173/` を開きます。
