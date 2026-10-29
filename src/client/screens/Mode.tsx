import { Link } from "@tanstack/react-router";

import shoppingArt from "../../../assets/page-icons/shoppingmode.png";
import pantryArt from "../../../assets/page-icons/pantrymode.png";

function ModeArrow() {
  return (
    <svg className="mode-arrow" width="13" height="17" viewBox="0 0 13 17" fill="none" aria-hidden="true">
      <path d="M1.5 2 L10 8.5 L1.5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ModeScreen() {
  return (
    <div className="main mode-page">
      <div className="mode-stage">
        <div className="mode-grid">
          <Link to="/scanner" className="card mode-card mode-shop">
            <img className="mode-art" src={shoppingArt} alt="Shopping mode" />
            <h1 className="mode-title">Shopping Mode</h1>
            <p className="mode-hint">Scan a list, cart or a receipt while you shop</p>
            <span className="mode-arrow-box">
              <ModeArrow />
            </span>
          </Link>
          <Link to="/pantry" className="card mode-card mode-pantry">
            <img className="mode-art" src={pantryArt} alt="Pantry mode" />
            <h1 className="mode-title">Pantry Mode</h1>
            <p className="mode-hint">Track what you have at home</p>
            <span className="mode-arrow-box">
              <ModeArrow />
            </span>
          </Link>
          <Link to="/quick-view" className="card mode-card mode-grocery">
            <h1 className="mode-title">Grocery List</h1>
          </Link>
        </div>
      </div>
    </div>
  );
}
