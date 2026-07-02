import { clearStoredToken } from "../utils/auth";

function Navbar() {

  const logout = () => {

    clearStoredToken();

    window.location.href = "/login";
  };

  return (

    <div className="bg-white shadow px-6 py-4 flex justify-between">

      <h1 className="text-2xl font-bold text-blue-600">
        Job Tracker
      </h1>

      <button
        onClick={logout}
        className="bg-red-500 text-white px-4 py-2 rounded"
      >
        Logout
      </button>

    </div>

  );
}

export default Navbar;
