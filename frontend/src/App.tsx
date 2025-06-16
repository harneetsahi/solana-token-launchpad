import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";

import "@solana/wallet-adapter-react-ui/styles.css";
import { CreateToken } from "./components/CreateToken";
import backdrop from "./public/backdrop.webp";

function App() {
  return (
    <div
      className="p-5 min-h-screen "
      style={{
        backgroundImage: `url(${backdrop})`,
        backgroundOrigin: "border-box",
        backgroundPosition: "top",
        backgroundSize: "cover  ",
        backgroundRepeat: "no-repeat",
      }}
    >
      <ConnectionProvider endpoint="https://api.devnet.solana.com">
        <WalletProvider wallets={[]} autoConnect>
          <WalletModalProvider>
            <div className="flex flex-col items-end gap-3 absolute right-4 ">
              <WalletMultiButton />
            </div>
            <CreateToken />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </div>
  );
}

export default App;
