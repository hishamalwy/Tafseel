# JaaS on PreProduction (tafseel.runasp.net)

Tafseel signs a short-lived RS256 token for each participant on the server. JaaS holds the public key; the private
key is a file on the server. It is never published, logged or sent to the browser.

1. Open the JaaS Console: <https://jaas.8x8.vc>.
2. Open **API Keys**.
3. **Add API key**, then generate a new RSA key pair (or upload your own public key).
4. Record the **App ID**: `vpaas-magic-cookie-…` (shown at the top of the console).
5. Record the **Key ID**: `vpaas-magic-cookie-…/xxxxxx` (the new key's row).
6. Download the **private key** (`.pk` / `.pem`) and keep it on your machine only. Do not paste it into chat, e-mail
   or the repository (`*.pem` and `*.key` are git-ignored).
7. Configure the three Tafseel PreProduction settings:
   - `JaaS:AppId` and `JaaS:KeyId` are in `src/Tafseel.Api/appsettings.PreProduction.json`. Change them only if
     you created a different key.
   - `JaaS:PrivateKeyPath` is the folder `App_Data/jaas`. In the MonsterASP File Manager, create
     `wwwroot\App_Data\jaas\` and upload the downloaded `.pk` file there under its original name (the `.pub` may sit
     beside it). The folder must hold exactly one private key. App_Data is not served to the web, and deployments
     neither overwrite nor delete it.
   - A Key ID and a private key belong together. A newly downloaded key needs the Key ID of that same new row;
     never pair a new key with an older Key ID.
   - In the JaaS console, turn **Allow meeting participants to join unauthenticated** OFF. Only Tafseel issues room
     tokens (to the session's student and teacher); a guest link would bypass that.
8. Restart the site (MonsterASP control panel → Websites → tafseel.runasp.net → Restart), or deploy.
   Without the key file the site refuses to start; upload the key first.
9. Test: book a live session between `student@gmail.com` and `teacher@gmail.com`. Inside the join window
   (15 minutes before the start), open the session as each of them in two browsers and select **Join**:
   - both land in the same room;
   - the teacher is the moderator;
   - a third account gets "not found".
