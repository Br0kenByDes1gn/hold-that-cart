import { useState } from "react";
import { Trash2 } from "lucide-react";

import milkArt from "../../../assets/item/milk_glass_and_carton Background Removed.png";
import eggsArt from "../../../assets/item/eggs Background Removed.png";
import breadArt from "../../../assets/item/bread_loaf Background Removed.png";
import bananasArt from "../../../assets/item/fruit_assortment Background Removed.png";
import chipsArt from "../../../assets/item/chips Background Removed.png";
import yogurtArt from "../../../assets/item/yogurt Background Removed.png";
import profilePic from "../../../assets/page-icons/profilepic.png";
import groceryListArt from "../../../assets/page-icons/businesscart.png";

interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  art: string;
  alt: string;
}

const INITIAL_ITEMS: GroceryItem[] = [
  { id: "milk", name: "Milk", quantity: "Qty 1", art: milkArt, alt: "Glass and carton of milk" },
  { id: "eggs", name: "Eggs", quantity: "Qty 12", art: eggsArt, alt: "Carton of eggs" },
  { id: "bread", name: "Bread", quantity: "Qty 1", art: breadArt, alt: "Loaf of bread" },
  { id: "bananas", name: "Bananas", quantity: "Qty 2", art: bananasArt, alt: "Bunch of bananas" },
  { id: "chips", name: "Chips", quantity: "Qty 1", art: chipsArt, alt: "Bag of chips" },
  { id: "yogurt", name: "Yogurt", quantity: "Qty 4", art: yogurtArt, alt: "Tubs of yogurt" },
];

export function QuickViewScreen() {
  const [items, setItems] = useState<GroceryItem[]>(INITIAL_ITEMS);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setChecked((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="grocery-page">
      <header className="pantry-top grocery-top">
        <span className="pantry-top-spacer" aria-hidden="true" />
        <div className="pantry-top-title">
          <img className="grocery-list-art" src={groceryListArt} alt="" aria-hidden="true" />
          <h1 className="pantry-title grocery-title">Grocery List</h1>
        </div>
        <img className="pantry-profile" src={profilePic} alt="Profile" />
      </header>

      <div className="grocery-list">
        {items.map((item) => {
          const isChecked = checked.has(item.id);
          return (
            <article className={`grocery-card ${isChecked ? "is-checked" : ""}`} key={item.id}>
              <input
                type="checkbox"
                className="grocery-check"
                checked={isChecked}
                onChange={() => toggle(item.id)}
                aria-label={`Mark ${item.name} as ${isChecked ? "not bought" : "bought"}`}
              />
              <span className="grocery-item-art">
                <img src={item.art} alt={item.alt} />
              </span>
              <div className="grocery-item-copy">
                <div className="grocery-item-name">{item.name}</div>
                <div className="grocery-item-qty">{item.quantity}</div>
              </div>
              <button
                type="button"
                className="grocery-remove"
                aria-label={`Remove ${item.name} from the list`}
                onClick={() => remove(item.id)}
              >
                <Trash2 size={20} strokeWidth={2} />
              </button>
            </article>
          );
        })}

        {items.length === 0 && (
          <p className="grocery-empty">Your grocery list is empty.</p>
        )}
      </div>
    </div>
  );
}
