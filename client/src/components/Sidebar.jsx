function Sidebar() {

  return (

    <div className="w-64 bg-gray-900 text-white min-h-screen p-5">

      <h2 className="text-2xl font-bold mb-8">
        Dashboard
      </h2>

      <ul className="space-y-4">

        <li className="hover:text-blue-400 cursor-pointer">
          Home
        </li>

        <li className="hover:text-blue-400 cursor-pointer">
          Add Job
        </li>

        <li className="hover:text-blue-400 cursor-pointer">
          Applications
        </li>

        <li className="hover:text-blue-400 cursor-pointer">
          Analytics
        </li>

      </ul>

    </div>

  );
}

export default Sidebar;